"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

type NumberKind = "ONE_TIME_SMS" | "TEMPORARY_HOSTING";
type View = "home" | "catalog" | "activations";

type Activation = {
  id: string; kind: NumberKind; country: string; product: string; phone?: string;
  status: string; salePriceCents: number; createdAt: string; expiresAt?: string;
};

type MiniAppSession = {
  user: { id: string; telegramUserId: number; username?: string; firstName: string; lastName?: string };
  wallet: { balanceCents: number; currency: string };
  recentActivations: Activation[];
};

type CatalogOffer = {
  id: string; provider: string; country: string; countryName: string; operator: string;
  product: string; label: string; description: string; kind: NumberKind;
  stock: number; successRate?: number; preview: true; salePriceCents: number; currency: "BRL";
};

type QuotePayload = {
  ok: true; mode: "preview"; purchaseExecutionEnabled: false; blockedReason: "PREVIEW_CATALOG_ONLY";
  canAfford: boolean; walletBalanceCents: number;
  offer: { id: string; country: string; countryName: string; product: string; label: string; kind: NumberKind; stock: number };
  price: { salePriceCents: number; currency: "BRL" };
};

function formatMoney(cents: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function kindLabel(kind: NumberKind) {
  return kind === "TEMPORARY_HOSTING" ? "Número temporário" : "Ativação curta";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    creating: "Criando", number_received: "Número recebido", waiting_sms: "Aguardando SMS",
    sms_received: "SMS recebido", completed: "Concluída", cancelled: "Cancelada",
    expired: "Expirada", refunded: "Reembolsada", failed: "Falhou",
  };
  return labels[status] ?? status;
}

function popup(title: string, message: string) {
  const webApp = window.Telegram?.WebApp;
  webApp?.HapticFeedback?.impactOccurred("light");
  webApp?.showPopup({ title, message, buttons: [{ type: "ok" }] });
}

export default function TelegramMiniAppPage() {
  const [session, setSession] = useState<MiniAppSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("home");
  const [catalog, setCatalog] = useState<CatalogOffer[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("all");
  const [kind, setKind] = useState<"all" | NumberKind>("all");
  const [selectedOffer, setSelectedOffer] = useState<CatalogOffer | null>(null);
  const [quote, setQuote] = useState<QuotePayload | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const loadSession = useCallback(async () => {
    setLoading(true); setError(null);
    const webApp = window.Telegram?.WebApp;
    if (!webApp?.initData) { setError("Abra esta página pelo bot no Telegram para autenticar sua sessão."); setLoading(false); return; }
    try {
      webApp.ready(); webApp.expand(); webApp.setHeaderColor("secondary_bg_color"); webApp.setBackgroundColor("bg_color");
      const response = await fetch("/api/telegram/miniapp/session", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ initData: webApp.initData }),
      });
      const payload = await response.json() as { session?: MiniAppSession; error?: string };
      if (!response.ok || !payload.session) throw new Error(payload.error ?? "SESSION_FAILED");
      setSession(payload.session); webApp.HapticFeedback?.notificationOccurred("success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível abrir sua sessão.");
      webApp?.HapticFeedback?.notificationOccurred("error");
    } finally { setLoading(false); }
  }, []);

  const loadCatalog = useCallback(async () => {
    if (catalog.length) return;
    setCatalogLoading(true); setCatalogError(null);
    try {
      const response = await fetch("/api/catalog?preview=1");
      const payload = await response.json() as { offers?: CatalogOffer[]; error?: string };
      if (!response.ok || !payload.offers) throw new Error(payload.error ?? "CATALOG_FAILED");
      setCatalog(payload.offers);
    } catch (cause) {
      setCatalogError(cause instanceof Error ? cause.message : "Não foi possível carregar o catálogo.");
    } finally { setCatalogLoading(false); }
  }, [catalog.length]);

  useEffect(() => { void loadSession(); }, [loadSession]);
  useEffect(() => { if (view === "catalog") void loadCatalog(); }, [view, loadCatalog]);

  const countries = useMemo(() => {
    const values = new Map<string, string>(); catalog.forEach((offer) => values.set(offer.country, offer.countryName));
    return [...values.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [catalog]);

  const filteredOffers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return catalog.filter((offer) => {
      if (country !== "all" && offer.country !== country) return false;
      if (kind !== "all" && offer.kind !== kind) return false;
      return !query || `${offer.countryName} ${offer.label} ${offer.product}`.toLowerCase().includes(query);
    });
  }, [catalog, country, kind, search]);

  async function openQuote(offer: CatalogOffer) {
    const webApp = window.Telegram?.WebApp; if (!webApp?.initData) return;
    setSelectedOffer(offer); setQuote(null); setQuoteLoading(true);
    try {
      const response = await fetch("/api/telegram/miniapp/quote", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ initData: webApp.initData, offerId: offer.id }),
      });
      const payload = await response.json() as QuotePayload | { error?: string };
      if (!response.ok || !("ok" in payload)) throw new Error((payload as { error?: string }).error ?? "QUOTE_FAILED");
      setQuote(payload as QuotePayload);
    } catch (cause) {
      setSelectedOffer(null); popup("Não foi possível calcular", cause instanceof Error ? cause.message : "Erro ao gerar orçamento.");
    } finally { setQuoteLoading(false); }
  }

  function simulateConfirmation() {
    if (!quote) return;
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
    popup("Simulação concluída", `Fluxo validado para ${quote.offer.label} em ${quote.offer.countryName}, total ${formatMoney(quote.price.salePriceCents)}. Nenhuma compra, reserva ou débito foi executado.`);
    setSelectedOffer(null); setQuote(null);
  }

  function goCatalog() { setView("catalog"); window.Telegram?.WebApp?.HapticFeedback?.selectionChanged(); }
  const recentList = session?.recentActivations ?? [];

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.brand}>
            {view !== "home" && <button className={styles.back} type="button" onClick={() => setView("home")} aria-label="Voltar">←</button>}
            <div className={styles.logo}>📲</div>
            <div><h1 className={styles.title}>{view === "home" ? "Central SMS" : view === "catalog" ? "Catálogo" : "Ativações"}</h1><p className={styles.subtitle}>{session ? `Olá, ${session.user.firstName}` : "Telegram Mini App"}</p></div>
          </div>
          <button className={styles.refresh} type="button" onClick={() => void loadSession()} disabled={loading}>{loading ? "…" : "↻"}</button>
        </header>

        {loading && <div className={styles.loading}>Validando sua sessão no Telegram…</div>}
        {error && <div className={styles.error}>{error}</div>}

        {session && view === "home" && <>
          <section className={styles.balanceCard} aria-label="Saldo da carteira"><div className={styles.balanceLabel}>Saldo disponível</div><div className={styles.balanceValue}>{formatMoney(session.wallet.balanceCents, session.wallet.currency)}</div><div className={styles.balanceMeta}>Carteira protegida por ledger transacional e idempotência.</div></section>
          <section className={styles.grid} aria-label="Ações principais">
            <button className={styles.action} type="button" onClick={goCatalog}><div className={styles.actionIcon}>📱</div><span className={styles.actionTitle}>Comprar número</span><span className={styles.actionText}>Escolher país, serviço e tipo de ativação</span></button>
            <button className={styles.action} type="button" onClick={goCatalog}><div className={styles.actionIcon}>🌎</div><span className={styles.actionTitle}>Países e serviços</span><span className={styles.actionText}>Catálogo, estoque e preço final</span></button>
            <button className={styles.action} type="button" onClick={() => popup("Recarregar", "O fluxo PIX será conectado na próxima etapa. Nenhuma cobrança foi criada.")}><div className={styles.actionIcon}>💳</div><span className={styles.actionTitle}>Recarregar</span><span className={styles.actionText}>Adicionar saldo via PIX</span></button>
            <button className={styles.action} type="button" onClick={() => setView("activations")}><div className={styles.actionIcon}>📋</div><span className={styles.actionTitle}>Ativações</span><span className={styles.actionText}>Status, números e histórico recente</span></button>
          </section>
          <section className={styles.section}><div className={styles.sectionHeader}><h2 className={styles.sectionTitle}>Ativações recentes</h2><span className={styles.badge}>{recentList.length}/5</span></div><ActivationList activations={recentList} currency={session.wallet.currency} compact /></section>
        </>}

        {session && view === "catalog" && <section className={styles.catalogSection}>
          <div className={styles.previewNotice}><strong>Modo de demonstração</strong><span>Estoque e preços abaixo servem para validar a experiência. Nenhuma oferta reserva número em provider externo.</span></div>
          <div className={styles.filters}>
            <input className={styles.input} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar serviço ou país" />
            <div className={styles.filterRow}>
              <select className={styles.select} value={country} onChange={(event) => setCountry(event.target.value)}><option value="all">Todos os países</option>{countries.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
              <select className={styles.select} value={kind} onChange={(event) => setKind(event.target.value as "all" | NumberKind)}><option value="all">Todos os tipos</option><option value="ONE_TIME_SMS">Ativação curta</option><option value="TEMPORARY_HOSTING">Número temporário</option></select>
            </div>
          </div>
          {catalogLoading && <div className={styles.loading}>Carregando catálogo…</div>}
          {catalogError && <div className={styles.error}>{catalogError}</div>}
          {!catalogLoading && !catalogError && <div className={styles.offerList}>
            {!filteredOffers.length && <div className={styles.empty}>Nenhuma oferta para esses filtros.</div>}
            {filteredOffers.map((offer) => <article className={styles.offerCard} key={offer.id}>
              <div className={styles.offerTop}><div><span className={styles.demoBadge}>DEMO</span><h3>{offer.label}</h3><p>{offer.countryName} · {kindLabel(offer.kind)}</p></div><div className={styles.offerPrice}>{formatMoney(offer.salePriceCents, offer.currency)}</div></div>
              <p className={styles.offerDescription}>{offer.description}</p>
              <div className={styles.offerMeta}><span>Estoque: {offer.stock}</span>{offer.successRate !== undefined && <span>Taxa: {offer.successRate}%</span>}</div>
              <button className={styles.primaryButton} type="button" onClick={() => void openQuote(offer)}>Ver orçamento</button>
            </article>)}
          </div>}
        </section>}

        {session && view === "activations" && <section className={styles.section}><div className={styles.sectionHeader}><h2 className={styles.sectionTitle}>Suas ativações</h2><span className={styles.badge}>{recentList.length} recentes</span></div><ActivationList activations={recentList} currency={session.wallet.currency} /><p className={styles.helper}>A sessão atual carrega as 5 ativações mais recentes. Paginação e SMS detalhado entram quando o provider real for conectado.</p></section>}

        <footer className={styles.footer}>Identidade validada no servidor pelo initData assinado do Telegram.<br />Compras reais permanecem desativadas até validação comercial dos providers.</footer>
      </div>

      {selectedOffer && <div className={styles.modalBackdrop} role="presentation" onClick={() => { setSelectedOffer(null); setQuote(null); }}>
        <section className={styles.modal} role="dialog" aria-modal="true" aria-label="Confirmar orçamento" onClick={(event) => event.stopPropagation()}>
          <div className={styles.modalHandle} />
          <div className={styles.modalHeader}><div><span className={styles.demoBadge}>SIMULAÇÃO</span><h2>{selectedOffer.label}</h2><p>{selectedOffer.countryName} · {kindLabel(selectedOffer.kind)}</p></div><button className={styles.close} type="button" onClick={() => { setSelectedOffer(null); setQuote(null); }}>×</button></div>
          {quoteLoading && <div className={styles.loading}>Calculando preço final…</div>}
          {quote && <>
            <div className={styles.quoteRows}><div className={styles.quoteTotal}><span>Preço final</span><strong>{formatMoney(quote.price.salePriceCents, quote.price.currency)}</strong></div><div><span>Seu saldo</span><strong>{formatMoney(quote.walletBalanceCents)}</strong></div></div>
            <div className={quote.canAfford ? styles.okNotice : styles.warnNotice}>{quote.canAfford ? "Seu saldo seria suficiente para este orçamento." : "Seu saldo seria insuficiente para este orçamento."}</div>
            <p className={styles.modalText}>Esta confirmação é somente uma simulação. Não haverá débito, reserva, compra ou chamada ao provider.</p>
            <button className={styles.primaryButton} type="button" onClick={simulateConfirmation}>Simular confirmação</button>
            <button className={styles.secondaryButton} type="button" onClick={() => { setSelectedOffer(null); setQuote(null); }}>Cancelar</button>
          </>}
        </section>
      </div>}
    </main>
  );
}

function ActivationList({ activations, currency, compact = false }: { activations: Activation[]; currency: string; compact?: boolean }) {
  if (!activations.length) return <div className={styles.empty}>Você ainda não possui ativações.</div>;
  return <div className={styles.list}>{activations.map((activation) => <article className={styles.item} key={activation.id}>
    <div className={styles.itemTop}><span className={styles.itemTitle}>{activation.kind === "TEMPORARY_HOSTING" ? "🗓" : "📱"} {kindLabel(activation.kind)}</span><span className={styles.itemStatus}>{statusLabel(activation.status)}</span></div>
    <div className={styles.itemMeta}><strong>{activation.country} · {activation.product}</strong><br />{activation.phone ? `Número: ${activation.phone}` : "Número ainda não atribuído"}<br />{formatMoney(activation.salePriceCents, currency)} · criada em {formatDate(activation.createdAt)}{!compact && activation.expiresAt && <><br />Expira em {formatDate(activation.expiresAt)}</>}</div>
  </article>)}</div>;
}
