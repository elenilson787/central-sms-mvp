"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SmsPoolRentalPanel from "./SmsPoolRentalPanel";
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
  stock: number | null;
  salePriceCents: number | null;
  currency: "BRL";
  pricingConfigured: boolean;
};

type CatalogPayload = {
  ok: true;
  mode: "live-readonly" | "live-purchasable";
  purchaseExecutionEnabled: boolean;
  countries: CatalogCountry[];
  selectedCountry: CatalogCountry;
  offers: CatalogOffer[];
  pricingConfigured: boolean;
  purchasesAvailable: boolean;
  approvedOnly: boolean;
};

type QuotePayload = {
  ok: true;
  mode: "live-readonly" | "live-purchasable";
  purchaseExecutionEnabled: boolean;
  blockedReason: string | null;
  canAfford: boolean | null;
  walletBalanceCents: number;
  offer: CatalogOffer & { stock: number; operator: string };
  selection: {
    strategy: "highest_success_rate_then_lowest_price";
    pool: string;
    successRate: number | null;
  };
  availability: { stock: number; successRate: number | null };
  price: { configured: boolean; salePriceCents: number | null; currency: "BRL" };
};

type PurchasePayload = {
  ok?: boolean;
  error?: string;
  activation?: {
    id?: string;
    phone?: string | null;
    status?: string;
  };
};

type Props = {
  onPurchaseCompleted?: () => void | Promise<void>;
};

type FeaturedService = {
  label: string;
  aliases: string[];
};

const FEATURED_SERVICES: FeaturedService[] = [
  { label: "Discord", aliases: ["discord"] },
  { label: "Telegram", aliases: ["telegram"] },
  { label: "Google", aliases: ["google", "gmail"] },
  { label: "Microsoft", aliases: ["microsoft", "outlook", "hotmail"] },
  { label: "Steam", aliases: ["steam"] },
  { label: "TikTok", aliases: ["tiktok", "tik tok"] },
  { label: "Instagram", aliases: ["instagram"] },
  { label: "Facebook", aliases: ["facebook"] },
  { label: "YouTube", aliases: ["youtube", "you tube"] },
];

function normalizeServiceName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function featuredMatchScore(offer: CatalogOffer, aliases: string[]) {
  const label = normalizeServiceName(offer.label);
  const description = normalizeServiceName(offer.description);
  let best = 0;
  for (const rawAlias of aliases) {
    const alias = normalizeServiceName(rawAlias);
    if (!alias) continue;
    if (label === alias) best = Math.max(best, 100);
    else if (label.startsWith(`${alias} `) || label.endsWith(` ${alias}`)) best = Math.max(best, 80);
    else if (label.includes(alias)) best = Math.max(best, 60);
    else if (description.includes(alias)) best = Math.max(best, 20);
  }
  return best;
}

function formatMoney(cents: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
}

function popup(title: string, message: string) {
  const webApp = window.Telegram?.WebApp;
  webApp?.HapticFeedback?.impactOccurred("light");
  webApp?.showPopup({ title, message, buttons: [{ type: "ok" }] });
}

export default function SmsPoolCatalogPanel({ onPurchaseCompleted }: Props) {
  const [mode, setMode] = useState<"one-time" | "rental">("one-time");
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
  const [reviewingPurchase, setReviewingPurchase] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const flowRef = useRef<HTMLDivElement | null>(null);
  const purchaseKeyRef = useRef<string | null>(null);

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

  const availableFeaturedServices = useMemo(() => {
    const availableOffers = offers.filter((offer) => (
      offer.stock !== null
      && offer.stock > 0
      && offer.pricingConfigured
      && offer.salePriceCents !== null
    ));

    return FEATURED_SERVICES.flatMap((featured) => {
      const bestMatch = availableOffers
        .map((offer) => ({ offer, score: featuredMatchScore(offer, featured.aliases) }))
        .filter((candidate) => candidate.score > 0)
        .sort((a, b) => b.score - a.score || (a.offer.salePriceCents ?? Number.MAX_SAFE_INTEGER) - (b.offer.salePriceCents ?? Number.MAX_SAFE_INTEGER))[0]?.offer;

      return bestMatch
        ? [{ displayLabel: featured.label, searchValue: bestMatch.label }]
        : [];
    });
  }, [offers]);

  function closeQuote() {
    setSelectedOffer(null);
    setQuote(null);
    setReviewingPurchase(false);
    setPurchaseLoading(false);
    purchaseKeyRef.current = null;
  }

  function selectMode(next: "one-time" | "rental") {
    setMode(next);
    closeQuote();
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
    window.setTimeout(() => flowRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  async function changeCountry(value: string) {
    setCountry(value);
    closeQuote();
    await loadCatalog(value);
  }

  async function openQuote(offer: CatalogOffer) {
    const webApp = window.Telegram?.WebApp;
    if (!webApp?.initData) return;
    setSelectedOffer(offer);
    setQuote(null);
    setReviewingPurchase(false);
    setQuoteLoading(true);
    setPurchaseLoading(false);
    purchaseKeyRef.current = null;
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
      purchaseKeyRef.current = crypto.randomUUID();
    } catch (cause) {
      closeQuote();
      popup("Não foi possível consultar", cause instanceof Error ? cause.message : "Falha ao consultar disponibilidade.");
    } finally {
      setQuoteLoading(false);
    }
  }

  async function executePurchase() {
    const webApp = window.Telegram?.WebApp;
    if (!webApp?.initData || !quote || !selectedOffer || quote.price.salePriceCents === null) return;
    if (!quote.purchaseExecutionEnabled) {
      popup("Compra ainda bloqueada", "A operação comercial ainda não foi liberada pelo administrador.");
      return;
    }

    const idempotencyKey = purchaseKeyRef.current ?? crypto.randomUUID();
    purchaseKeyRef.current = idempotencyKey;
    setPurchaseLoading(true);

    try {
      const response = await fetch("/api/telegram/miniapp/catalog/purchase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          initData: webApp.initData,
          reviewedOfferId: quote.offer.id,
          reviewedSalePriceCents: quote.price.salePriceCents,
          idempotencyKey,
          confirmation: "BUY_ONE_REAL_SMS",
        }),
      });
      const payload = await response.json() as PurchasePayload;

      if (!response.ok || !payload.ok || !payload.activation) {
        const reason = payload.error ?? "PURCHASE_FAILED";
        if (reason === "OFFER_CHANGED_REVIEW_REQUIRED" || reason === "PRICE_CHANGED_REVIEW_REQUIRED") {
          setReviewingPurchase(false);
          popup("Oferta atualizada", "Preço, rota ou disponibilidade mudou. Revise a cotação novamente antes de comprar.");
          await openQuote(selectedOffer);
          return;
        }
        throw new Error(reason);
      }

      webApp.HapticFeedback?.notificationOccurred("success");
      const phone = payload.activation.phone?.trim();
      popup(
        "Compra confirmada",
        phone
          ? `Seu número ${phone} foi reservado. Acompanhe o SMS em Minhas ativações.`
          : "Seu pedido foi criado. Acompanhe a atribuição do número em Minhas ativações.",
      );
      closeQuote();
      await onPurchaseCompleted?.();
    } catch (cause) {
      webApp.HapticFeedback?.notificationOccurred("error");
      popup("Não foi possível concluir", cause instanceof Error ? cause.message : "Falha ao concluir a compra.");
    } finally {
      setPurchaseLoading(false);
    }
  }

  const quotedPrice = quote?.price.salePriceCents ?? null;
  const canReviewPurchase = Boolean(
    quote
    && quote.availability.stock > 0
    && quotedPrice !== null
    && quote.canAfford === true,
  );
  const balanceAfterPurchase = quote && quotedPrice !== null
    ? quote.walletBalanceCents - quotedPrice
    : null;

  return <section className={styles.catalogSection}>
    <div className={styles.offerList}>
      <article className={styles.offerCard}>
        <div className={styles.offerTop}>
          <div>
            <span className={mode === "one-time" ? styles.demoBadge : styles.badge}>ATIVAÇÃO ÚNICA</span>
            <h3>⚡ Ativação única</h3>
            <p>Receba um código SMS agora</p>
          </div>
        </div>
        <p className={styles.offerDescription}>
          Ideal quando você precisa receber um código de verificação uma única vez. O número é temporário e não fica reservado permanentemente para você.
        </p>
        <button className={mode === "one-time" ? styles.primaryButton : styles.secondaryButton} type="button" onClick={() => selectMode("one-time")}>Usar ativação única</button>
      </article>

      <article className={styles.offerCard}>
        <div className={styles.offerTop}>
          <div>
            <span className={mode === "rental" ? styles.demoBadge : styles.badge}>CATÁLOGO REAL</span>
            <h3>🗓️ Manter número por mais tempo</h3>
            <p>Mesmo número por vários dias</p>
          </div>
        </div>
        <p className={styles.offerDescription}>
          Indicado para contas que podem pedir nova verificação, recuperação de acesso ou login em outro aparelho. Períodos, serviços, preço e estoque são consultados no catálogo de aluguel longo.
        </p>
        <button className={mode === "rental" ? styles.primaryButton : styles.secondaryButton} type="button" onClick={() => selectMode("rental")}>Ver aluguel longo</button>
      </article>
    </div>

    <div ref={flowRef}>
      {mode === "rental" ? <SmsPoolRentalPanel /> : <>
        <div className={styles.warnNotice}>
          <strong>Atenção sobre ativação única:</strong> depois que o pedido expirar, você pode perder o acesso ao número. Se o app pedir outro código no futuro, talvez não seja possível recebê-lo. Para contas que você pretende manter, prefira aluguel longo.
        </div>

        <div className={styles.catalogGuide}>
          <div className={styles.guideIcon}>🔎</div>
          <div>
            <strong>Para qual app ou site você precisa de um número?</strong>
            <p>Digite o nome do serviço que vai enviar o código por SMS. O catálogo mostra somente serviços aprovados para venda.</p>
          </div>
        </div>

        <div className={styles.filters}>
          <label className={styles.fieldLabel} htmlFor="service-search">Serviço que você quer ativar</label>
          <input
            id="service-search"
            className={styles.input}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ex.: Discord, Telegram, Instagram"
            autoComplete="off"
          />
          {!loading && availableFeaturedServices.length > 0 && <div className={styles.quickSearches} aria-label="Serviços populares disponíveis agora">
            <span>Disponíveis agora:</span>
            {availableFeaturedServices.map((item) => (
              <button
                key={item.displayLabel}
                className={styles.quickSearchButton}
                type="button"
                onClick={() => setSearch(item.searchValue)}
              >
                {item.displayLabel}
              </button>
            ))}
          </div>}

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
          <span>Você verá apenas serviços aprovados para venda neste país.</span>
        </div>}

        {!loading && !error && searchQuery.length >= 2 && <>
          <div className={styles.resultsHeader}>
            <strong>{filteredOffers.length} {filteredOffers.length === 1 ? "opção encontrada" : "opções encontradas"}</strong>
            <span>para “{searchQuery}”</span>
          </div>
          <div className={styles.offerList}>
            {!filteredOffers.length && <div className={styles.empty}>Não encontramos um serviço aprovado com esse nome neste país.</div>}
            {filteredOffers.map((offer) => <article className={styles.offerCard} key={offer.id}>
              <div className={styles.offerTop}>
                <div>
                  <span className={styles.demoBadge}>ATIVAÇÃO ÚNICA</span>
                  <h3>Número para {offer.label}</h3>
                  <p>{offer.countryName} · SMS de verificação</p>
                </div>
                <div className={styles.offerPrice}>
                  {offer.salePriceCents !== null ? `A partir de ${formatMoney(offer.salePriceCents)}` : "Preço em configuração"}
                </div>
              </div>
              <p className={styles.offerDescription}>Use esta opção para receber o código SMS enviado pelo {offer.label}. A cotação final prioriza a rota disponível com maior taxa de sucesso.</p>
              <div className={styles.offerMeta}>
                <span>País: {offer.countryName}</span>
                <span>Rota: selecionada por qualidade</span>
              </div>
              <button className={styles.primaryButton} type="button" onClick={() => void openQuote(offer)}>Ver melhor disponibilidade para {offer.label}</button>
            </article>)}
          </div>
        </>}

        {selectedOffer && <div className={styles.modalBackdrop} role="presentation" onClick={closeQuote}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-label={`Número para ${selectedOffer.label}`} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHandle} />
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.demoBadge}>{reviewingPurchase ? "REVISÃO DO PEDIDO" : "ATIVAÇÃO ÚNICA"}</span>
                <h2>{reviewingPurchase ? "Revise seu pedido" : `Número para ${selectedOffer.label}`}</h2>
                <p>{selectedOffer.countryName} · SMS de verificação</p>
              </div>
              <button className={styles.close} type="button" onClick={closeQuote}>×</button>
            </div>

            {quoteLoading && <div className={styles.loading}>Comparando rotas, preço e disponibilidade…</div>}

            {quote && !reviewingPurchase && <>
              <div className={styles.quoteRows}>
                <div className={styles.quoteTotal}><span>Preço final</span><strong>{quotedPrice !== null ? formatMoney(quotedPrice) : "Preço em configuração"}</strong></div>
                <div><span>Disponibilidade</span><strong>{quote.availability.stock > 0 ? "Disponível agora" : "Sem estoque"}</strong></div>
                <div><span>Taxa de sucesso</span><strong>{quote.availability.successRate !== null ? `${quote.availability.successRate}%` : "—"}</strong></div>
                <div><span>Rota selecionada</span><strong>Otimizada</strong></div>
                <div><span>Seu saldo</span><strong>{formatMoney(quote.walletBalanceCents)}</strong></div>
              </div>

              <div className={quote.availability.stock > 0 ? styles.okNotice : styles.warnNotice}>
                {quote.availability.stock > 0 ? `Há números disponíveis para receber SMS do ${selectedOffer.label} agora. A disponibilidade será confirmada novamente ao comprar.` : `Não há números disponíveis para ${selectedOffer.label} neste momento.`}
              </div>

              {quotedPrice !== null && quote.canAfford === false && <div className={styles.warnNotice}>
                <strong>Saldo insuficiente.</strong> Recarregue sua carteira antes de concluir esta compra.
              </div>}

              <div className={styles.warnNotice}>
                Este número é de ativação temporária. Depois que o pedido expirar, ele não fica reservado para você. Se precisar receber outro código no futuro, prefira a modalidade de aluguel longo.
              </div>

              <p className={styles.modalText}>
                A Central SMS comparou as rotas disponíveis e priorizou a maior taxa de sucesso, usando o menor preço como desempate.
              </p>

              <button
                className={styles.primaryButton}
                type="button"
                disabled={!canReviewPurchase}
                onClick={() => {
                  window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
                  setReviewingPurchase(true);
                }}
              >
                {quote.availability.stock <= 0
                  ? "Sem estoque neste momento"
                  : quotedPrice === null
                    ? "Preço ainda em configuração"
                    : quote.canAfford === false
                      ? "Saldo insuficiente"
                      : "Continuar para revisão"}
              </button>
              <button className={styles.secondaryButton} type="button" onClick={closeQuote}>Fechar</button>
            </>}

            {quote && reviewingPurchase && <>
              <div className={styles.catalogGuide}>
                <div className={styles.guideIcon}>🧾</div>
                <div>
                  <strong>Confira antes de confirmar</strong>
                  <p>Ao confirmar, o servidor revalida rota, preço, estoque, saldo e allow-list antes de qualquer débito.</p>
                </div>
              </div>

              <div className={styles.quoteRows}>
                <div><span>Produto</span><strong>Número para {selectedOffer.label}</strong></div>
                <div><span>País do número</span><strong>{selectedOffer.countryName}</strong></div>
                <div><span>Tipo</span><strong>Ativação única</strong></div>
                <div><span>Rota selecionada</span><strong>Otimizada</strong></div>
                <div><span>Taxa de sucesso</span><strong>{quote.selection.successRate !== null ? `${quote.selection.successRate}%` : "—"}</strong></div>
                <div className={styles.quoteTotal}><span>Preço final</span><strong>{quotedPrice !== null ? formatMoney(quotedPrice) : "—"}</strong></div>
                <div><span>Saldo atual</span><strong>{formatMoney(quote.walletBalanceCents)}</strong></div>
                <div><span>Saldo após a compra</span><strong>{balanceAfterPurchase !== null ? formatMoney(balanceAfterPurchase) : "—"}</strong></div>
              </div>

              <div className={styles.warnNotice}>
                <strong>Importante:</strong> esta compra entregará um número temporário para receber o SMS do {selectedOffer.label}. O número não será seu de forma permanente e pode não aceitar novos códigos depois que a ativação expirar.
              </div>

              <div className={styles.okNotice}>
                O preço, a rota e o estoque serão conferidos novamente no servidor. Se a melhor rota mudar ou o preço subir, a compra será interrompida para uma nova revisão. Em caso de expiração/reembolso confirmado pelo fornecedor, o valor da ativação volta automaticamente para sua carteira.
              </div>

              <button
                className={styles.primaryButton}
                type="button"
                disabled={!quote.purchaseExecutionEnabled || purchaseLoading}
                onClick={() => void executePurchase()}
              >
                {purchaseLoading
                  ? "Confirmando compra…"
                  : quote.purchaseExecutionEnabled
                    ? `Confirmar compra por ${quotedPrice !== null ? formatMoney(quotedPrice) : "—"}`
                    : "Confirmar compra — aguardando liberação"}
              </button>
              {!quote.purchaseExecutionEnabled && <div className={styles.warnNotice}>
                A compra real permanece bloqueada pela trava comercial do sistema. Você pode revisar o pedido, mas nenhum débito será feito enquanto ela estiver desligada.
              </div>}
              <button className={styles.secondaryButton} type="button" disabled={purchaseLoading} onClick={() => setReviewingPurchase(false)}>Voltar</button>
              <button className={styles.secondaryButton} type="button" disabled={purchaseLoading} onClick={closeQuote}>Fechar</button>
            </>}
          </section>
        </div>}
      </>}
    </div>
  </section>;
}