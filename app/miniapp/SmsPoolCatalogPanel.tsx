"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

type CatalogCountry = {
  id: string;
  name: string;
  code: string;
};

type CatalogOffer = {
  id: string;
  country: string;
  countryName: string;
  product: string;
  label: string;
  description: string;
  kind: "ONE_TIME_SMS";
  stock: null;
  salePriceCents: number | null;
  currency: "BRL";
  pricingConfigured: boolean;
};

type CatalogPayload = {
  ok: true;
  mode: "live-readonly";
  purchaseExecutionEnabled: false;
  countries: CatalogCountry[];
  selectedCountry: CatalogCountry;
  offers: CatalogOffer[];
  pricingConfigured: boolean;
  purchasesAvailable: false;
};

type QuotePayload = {
  ok: true;
  mode: "live-readonly";
  purchaseExecutionEnabled: false;
  blockedReason: "PURCHASE_NOT_AVAILABLE";
  canAfford: boolean | null;
  walletBalanceCents: number;
  offer: CatalogOffer & { stock: number };
  availability: { stock: number; successRate: number | null };
  price: { configured: boolean; salePriceCents: number | null; currency: "BRL" };
};

const QUICK_SEARCHES = ["YouTube", "Discord", "Steam"];

function formatMoney(cents: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
}

function popup(title: string, message: string) {
  const webApp = window.Telegram?.WebApp;
  webApp?.HapticFeedback?.impactOccurred("light");
  webApp?.showPopup({ title, message, buttons: [{ type: "ok" }] });
}

export default function SmsPoolCatalogPanel() {
  const [countries, setCountries] = useState<CatalogCountry[]>([]);
  const [country, setCountry] = useState("BR");
  const [offers, setOffers] = useState<CatalogOffer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pricingConfigured, setPricingConfigured] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<CatalogOffer | null>(null);
  const [quote, setQuote] = useState<QuotePayload | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const loadCatalog = useCallback(async (countrySelector: string) => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp?.initData) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/telegram/miniapp/catalog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: webApp.initData, country: countrySelector }),
      });
      const payload = await response.json() as CatalogPayload | { error?: string };
      if (!response.ok || !("ok" in payload)) {
        throw new Error((payload as { error?: string }).error ?? "CATALOG_FAILED");
      }
      const catalog = payload as CatalogPayload;
      setCountries(catalog.countries);
      setCountry(catalog.selectedCountry.code || catalog.selectedCountry.id);
      setOffers(catalog.offers);
      setPricingConfigured(catalog.pricingConfigured);
    } catch (cause) {
      setOffers([]);
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar o catálogo real.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCatalog("BR"); }, [loadCatalog]);

  const searchQuery = search.trim();
  const filteredOffers = useMemo(() => {
    const query = searchQuery.toLocaleLowerCase("pt-BR");
    if (query.length < 2) return [];
    return offers.filter((offer) => `${offer.label} ${offer.countryName}`.toLocaleLowerCase("pt-BR").includes(query));
  }, [offers, searchQuery]);

  async function changeCountry(value: string) {
    setCountry(value);
    setSelectedOffer(null);
    setQuote(null);
    await loadCatalog(value);
  }

  async function openQuote(offer: CatalogOffer) {
    const webApp = window.Telegram?.WebApp;
    if (!webApp?.initData) return;
    setSelectedOffer(offer);
    setQuote(null);
    setQuoteLoading(true);
    try {
      const response = await fetch("/api/telegram/miniapp/catalog/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: webApp.initData, offerId: offer.id }),
      });
      const payload = await response.json() as QuotePayload | { error?: string };
      if (!response.ok || !("ok" in payload)) {
        throw new Error((payload as { error?: string }).error ?? "CATALOG_QUOTE_FAILED");
      }
      setQuote(payload as QuotePayload);
    } catch (cause) {
      setSelectedOffer(null);
      popup("Não foi possível consultar", cause instanceof Error ? cause.message : "Falha ao consultar disponibilidade.");
    } finally {
      setQuoteLoading(false);
    }
  }

  return <section className={styles.catalogSection}>
    <div className={styles.catalogGuide}>
      <div className={styles.guideIcon}>🔎</div>
      <div>
        <strong>Para qual app ou site você precisa de um número?</strong>
        <p>Digite o nome do serviço que vai enviar o código por SMS. Ex.: procure por <b>YouTube</b> para encontrar um número para verificação do YouTube.</p>
      </div>
    </div>

    <div className={styles.filters}>
      <label className={styles.fieldLabel} htmlFor="service-search">Serviço que você quer ativar</label>
      <input
        id="service-search"
        className={styles.input}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Ex.: YouTube, Discord, Steam"
        autoComplete="off"
      />
      <div className={styles.quickSearches} aria-label="Buscas rápidas">
        <span>Exemplos:</span>
        {QUICK_SEARCHES.map((item) => <button key={item} className={styles.quickSearchButton} type="button" onClick={() => setSearch(item)}>{item}</button>)}
      </div>

      <label className={styles.fieldLabel} htmlFor="number-country">País do número</label>
      <select id="number-country" className={styles.select} value={country} onChange={(event) => void changeCountry(event.target.value)}>
        {countries.map((item) => <option key={item.id} value={item.code || item.id}>{item.name} {item.code ? `(${item.code})` : ""}</option>)}
      </select>
      <span className={styles.helperText}>O país define de onde será o número que receberá o SMS.</span>
    </div>

    {!pricingConfigured && !loading && <div className={styles.warnNotice}>
      Os preços finais em reais estão sendo configurados. O catálogo e a disponibilidade já podem ser consultados normalmente.
    </div>}

    {loading && <div className={styles.loading}>Carregando serviços disponíveis…</div>}
    {error && <div className={styles.error}>{error}</div>}

    {!loading && !error && searchQuery.length < 2 && <div className={styles.searchPrompt}>
      <strong>Comece digitando o nome do app ou site</strong>
      <span>Por exemplo: “YouTube”. Você verá apenas as opções correspondentes, em vez de navegar por centenas de serviços.</span>
    </div>}

    {!loading && !error && searchQuery.length >= 2 && <>
      <div className={styles.resultsHeader}>
        <strong>{filteredOffers.length} {filteredOffers.length === 1 ? "opção encontrada" : "opções encontradas"}</strong>
        <span>para “{searchQuery}”</span>
      </div>
      <div className={styles.offerList}>
        {!filteredOffers.length && <div className={styles.empty}>Não encontramos esse serviço neste país. Confira a escrita ou tente outro país.</div>}
        {filteredOffers.map((offer) => <article className={styles.offerCard} key={offer.id}>
          <div className={styles.offerTop}>
            <div>
              <span className={styles.demoBadge}>AO VIVO</span>
              <h3>Número para {offer.label}</h3>
              <p>{offer.countryName} · SMS de verificação</p>
            </div>
            <div className={styles.offerPrice}>
              {offer.salePriceCents !== null ? formatMoney(offer.salePriceCents) : "Preço em configuração"}
            </div>
          </div>
          <p className={styles.offerDescription}>Use esta opção para receber o código SMS enviado pelo {offer.label}. O número é disponibilizado após a compra.</p>
          <div className={styles.offerMeta}>
            <span>País: {offer.countryName}</span>
            <span>Disponibilidade: consultar</span>
          </div>
          <button className={styles.primaryButton} type="button" onClick={() => void openQuote(offer)}>Ver disponibilidade para {offer.label}</button>
        </article>)}
      </div>
    </>}

    {selectedOffer && <div className={styles.modalBackdrop} role="presentation" onClick={() => { setSelectedOffer(null); setQuote(null); }}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-label={`Número para ${selectedOffer.label}`} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHandle} />
        <div className={styles.modalHeader}>
          <div><span className={styles.demoBadge}>CATÁLOGO REAL</span><h2>Número para {selectedOffer.label}</h2><p>{selectedOffer.countryName} · SMS de verificação</p></div>
          <button className={styles.close} type="button" onClick={() => { setSelectedOffer(null); setQuote(null); }}>×</button>
        </div>

        {quoteLoading && <div className={styles.loading}>Consultando preço final e disponibilidade…</div>}
        {quote && <>
          <div className={styles.quoteRows}>
            <div className={styles.quoteTotal}><span>Preço final</span><strong>{quote.price.salePriceCents !== null ? formatMoney(quote.price.salePriceCents) : "Preço em configuração"}</strong></div>
            <div><span>Números disponíveis agora</span><strong>{quote.availability.stock}</strong></div>
            <div><span>Taxa de sucesso</span><strong>{quote.availability.successRate !== null ? `${quote.availability.successRate}%` : "—"}</strong></div>
            <div><span>Seu saldo</span><strong>{formatMoney(quote.walletBalanceCents)}</strong></div>
          </div>

          <div className={quote.availability.stock > 0 ? styles.okNotice : styles.warnNotice}>
            {quote.availability.stock > 0 ? `Há números disponíveis para receber SMS do ${selectedOffer.label} agora.` : `Não há números disponíveis para ${selectedOffer.label} neste momento.`}
          </div>

          <p className={styles.modalText}>
            Quando a compra estiver liberada, você receberá um número para usar no {selectedOffer.label} e acompanhará o código SMS dentro da Central SMS.
          </p>
          <button className={styles.primaryButton} type="button" disabled>
            Compra ainda bloqueada
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => { setSelectedOffer(null); setQuote(null); }}>Fechar</button>
        </>}
      </section>
    </div>}
  </section>;
}
