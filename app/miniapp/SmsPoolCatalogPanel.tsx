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
  provider: "smspool";
  country: string;
  countryId: string;
  countryName: string;
  operator: string;
  product: string;
  label: string;
  description: string;
  kind: "ONE_TIME_SMS";
  stock: null;
  successRate?: number;
  providerPrice: number;
  providerCurrency: string;
  salePriceCents: number | null;
  currency: "BRL";
  pricingConfigured: boolean;
};

type CatalogPayload = {
  ok: true;
  mode: "live-readonly";
  provider: "smspool";
  countries: CatalogCountry[];
  selectedCountry: CatalogCountry;
  offers: CatalogOffer[];
  pricingConfigured: boolean;
  providerCurrency: string;
  purchasesEnabled: boolean;
  commercialApproved: boolean;
};

type QuotePayload = {
  ok: true;
  mode: "live-readonly";
  purchaseExecutionEnabled: false;
  blockedReason: string;
  canAfford: boolean | null;
  walletBalanceCents: number;
  offer: CatalogOffer & { stock: number };
  availability: { stock: number; successRate: number | null };
  providerPrice: { value: number; currency: string };
  price: { configured: boolean; salePriceCents: number | null; currency: "BRL" };
  safety: { purchasesEnabled: boolean; commercialApproved: boolean; livePurchasesAllowed: boolean };
};

function formatMoney(cents: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
}

function formatProviderPrice(value: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
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
  const [commercialApproved, setCommercialApproved] = useState(false);
  const [purchasesEnabled, setPurchasesEnabled] = useState(false);
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
        throw new Error((payload as { error?: string }).error ?? "SMSPOOL_CATALOG_FAILED");
      }
      const catalog = payload as CatalogPayload;
      setCountries(catalog.countries);
      setCountry(catalog.selectedCountry.code || catalog.selectedCountry.id);
      setOffers(catalog.offers);
      setPricingConfigured(catalog.pricingConfigured);
      setCommercialApproved(catalog.commercialApproved);
      setPurchasesEnabled(catalog.purchasesEnabled);
    } catch (cause) {
      setOffers([]);
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar o catálogo real.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCatalog("BR"); }, [loadCatalog]);

  const filteredOffers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return offers;
    return offers.filter((offer) => `${offer.label} ${offer.countryName}`.toLocaleLowerCase("pt-BR").includes(query));
  }, [offers, search]);

  async function changeCountry(value: string) {
    setCountry(value);
    setSearch("");
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
        throw new Error((payload as { error?: string }).error ?? "SMSPOOL_QUOTE_FAILED");
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
    <div className={styles.previewNotice}>
      <strong>Catálogo real conectado ao SMSPool</strong>
      <span>Países, serviços e preços vêm do provider. A compra externa continua bloqueada enquanto a aprovação comercial estiver pendente.</span>
    </div>

    <div className={styles.filters}>
      <input
        className={styles.input}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar serviço"
      />
      <select className={styles.select} value={country} onChange={(event) => void changeCountry(event.target.value)}>
        {countries.map((item) => <option key={item.id} value={item.code || item.id}>{item.name} {item.code ? `(${item.code})` : ""}</option>)}
      </select>
    </div>

    {!pricingConfigured && !loading && <div className={styles.warnNotice}>
      Catálogo conectado, mas a conversão para BRL ainda não está configurada. Até definir PROVIDER_TO_BRL_RATE, exibimos o preço bruto do provider.
    </div>}

    <div className={styles.offerMeta}>
      <span>{offers.length} serviços neste país</span>
      <span>Compras: {purchasesEnabled ? "habilitadas" : "bloqueadas"}</span>
      <span>Aprovação comercial: {commercialApproved ? "confirmada" : "pendente"}</span>
    </div>

    {loading && <div className={styles.loading}>Carregando catálogo real…</div>}
    {error && <div className={styles.error}>{error}</div>}

    {!loading && !error && <div className={styles.offerList}>
      {!filteredOffers.length && <div className={styles.empty}>Nenhum serviço encontrado para este filtro.</div>}
      {filteredOffers.map((offer) => <article className={styles.offerCard} key={offer.id}>
        <div className={styles.offerTop}>
          <div>
            <span className={styles.demoBadge}>AO VIVO</span>
            <h3>{offer.label}</h3>
            <p>{offer.countryName} · SMS de uso único</p>
          </div>
          <div className={styles.offerPrice}>
            {offer.salePriceCents !== null
              ? formatMoney(offer.salePriceCents)
              : formatProviderPrice(offer.providerPrice, offer.providerCurrency)}
          </div>
        </div>
        <p className={styles.offerDescription}>{offer.description}</p>
        <div className={styles.offerMeta}>
          <span>Pool: {offer.operator}</span>
          <span>Estoque: consultar</span>
          {offer.salePriceCents === null && <span>Preço bruto do provider</span>}
        </div>
        <button className={styles.primaryButton} type="button" onClick={() => void openQuote(offer)}>Ver disponibilidade</button>
      </article>)}
    </div>}

    {selectedOffer && <div className={styles.modalBackdrop} role="presentation" onClick={() => { setSelectedOffer(null); setQuote(null); }}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-label="Disponibilidade do número" onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHandle} />
        <div className={styles.modalHeader}>
          <div><span className={styles.demoBadge}>CATÁLOGO REAL</span><h2>{selectedOffer.label}</h2><p>{selectedOffer.countryName} · SMS de uso único</p></div>
          <button className={styles.close} type="button" onClick={() => { setSelectedOffer(null); setQuote(null); }}>×</button>
        </div>

        {quoteLoading && <div className={styles.loading}>Consultando preço, estoque e taxa de sucesso…</div>}
        {quote && <>
          <div className={styles.quoteRows}>
            <div className={styles.quoteTotal}><span>Preço final</span><strong>{quote.price.salePriceCents !== null ? formatMoney(quote.price.salePriceCents) : "Câmbio BRL pendente"}</strong></div>
            <div><span>Preço provider</span><strong>{formatProviderPrice(quote.providerPrice.value, quote.providerPrice.currency)}</strong></div>
            <div><span>Estoque agora</span><strong>{quote.availability.stock}</strong></div>
            <div><span>Taxa de sucesso</span><strong>{quote.availability.successRate !== null ? `${quote.availability.successRate}%` : "—"}</strong></div>
            <div><span>Seu saldo</span><strong>{formatMoney(quote.walletBalanceCents)}</strong></div>
          </div>

          <div className={quote.availability.stock > 0 ? styles.okNotice : styles.warnNotice}>
            {quote.availability.stock > 0 ? "Há números disponíveis neste pool agora." : "Este pool está sem estoque neste momento."}
          </div>

          <p className={styles.modalText}>
            Esta consulta é real, mas nenhuma compra, reserva ou débito é executado. A venda será liberada somente após aprovação comercial do SMSPool e ativação explícita da Central SMS.
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
