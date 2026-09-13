"use client";

import { useCallback, useEffect, useState } from "react";
import ActivationTracking from "./ActivationTracking";
import PixGlobalMonitor from "./PixGlobalMonitor";
import PixPaymentHistory from "./PixPaymentHistory";
import PixRechargePanel from "./PixRechargePanel";
import SmsPoolCatalogPanel from "./SmsPoolCatalogPanel";
import styles from "./page.module.css";

type NumberKind = "ONE_TIME_SMS" | "TEMPORARY_HOSTING";
type View = "home" | "catalog" | "activations" | "pix";

type Activation = {
  id: string;
  kind: NumberKind;
  country: string;
  product: string;
  phone?: string;
  status: string;
  salePriceCents: number;
  createdAt: string;
  updatedAt?: string;
  expiresAt?: string;
  smsCode?: string;
  smsText?: string;
};

type MiniAppSession = {
  user: {
    id: string;
    telegramUserId: number;
    username?: string;
    firstName: string;
    lastName?: string;
  };
  wallet: { balanceCents: number; currency: string };
  recentActivations: Activation[];
};

const LIVE_ACTIVATION_STATUSES = new Set(["creating", "number_received", "waiting_sms"]);

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
    creating: "Criando",
    number_received: "Número recebido",
    waiting_sms: "Aguardando SMS",
    sms_received: "SMS recebido",
    completed: "Concluída",
    cancelled: "Cancelada",
    expired: "Expirada",
    refunded: "Reembolsada",
    failed: "Falhou",
  };
  return labels[status] ?? status;
}

function viewTitle(view: View) {
  if (view === "catalog") return "Catálogo";
  if (view === "activations") return "Minhas ativações";
  if (view === "pix") return "Recarregar via PIX";
  return "Central SMS";
}

export default function TelegramMiniAppPage() {
  const [session, setSession] = useState<MiniAppSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [trackingRefreshing, setTrackingRefreshing] = useState(false);
  const [view, setView] = useState<View>("home");

  const loadSession = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (silent) setTrackingRefreshing(true);
    else {
      setLoading(true);
      setError(null);
    }

    const webApp = window.Telegram?.WebApp;
    if (!webApp?.initData) {
      if (!silent) setError("Abra esta página pelo bot no Telegram para autenticar sua sessão.");
      if (silent) setTrackingRefreshing(false);
      else setLoading(false);
      return;
    }

    try {
      webApp.ready();
      webApp.expand();
      webApp.setHeaderColor("secondary_bg_color");
      webApp.setBackgroundColor("bg_color");
      const response = await fetch("/api/telegram/miniapp/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: webApp.initData }),
      });
      const payload = await response.json() as { session?: MiniAppSession; error?: string };
      if (!response.ok || !payload.session) throw new Error(payload.error ?? "SESSION_FAILED");
      setSession(payload.session);
      if (!silent) webApp.HapticFeedback?.notificationOccurred("success");
    } catch (cause) {
      if (!silent) {
        setError(cause instanceof Error ? cause.message : "Não foi possível abrir sua sessão.");
        webApp?.HapticFeedback?.notificationOccurred("error");
      } else {
        console.error("MINIAPP_SESSION_REFRESH_FAILED", cause);
      }
    } finally {
      if (silent) setTrackingRefreshing(false);
      else setLoading(false);
    }
  }, []);

  const refreshSessionSilently = useCallback(() => loadSession({ silent: true }), [loadSession]);

  const refreshActivations = useCallback(async () => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp?.initData) return;

    setTrackingRefreshing(true);
    try {
      const response = await fetch("/api/telegram/miniapp/activations/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: webApp.initData }),
      });
      const payload = await response.json() as { session?: MiniAppSession; error?: string };
      if (!response.ok || !payload.session) {
        if (payload.error === "TELEGRAM_INIT_DATA_EXPIRED") {
          setError("Sua sessão do Telegram expirou. Feche e abra novamente a Central SMS pelo bot.");
        }
        throw new Error(payload.error ?? "ACTIVATION_REFRESH_FAILED");
      }
      setSession(payload.session);
      setError(null);
    } catch (cause) {
      console.error("MINIAPP_ACTIVATION_REFRESH_FAILED", cause);
    } finally {
      setTrackingRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadSession(); }, [loadSession]);

  const recentList = session?.recentActivations ?? [];
  const homeRecentList = recentList.slice(0, 5);
  const hasLiveActivation = recentList.some((activation) => LIVE_ACTIVATION_STATUSES.has(activation.status));

  useEffect(() => {
    if (view !== "activations" || !hasLiveActivation) return;
    const timer = window.setInterval(() => {
      void refreshActivations();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [view, hasLiveActivation, refreshActivations]);

  function goCatalog() {
    setView("catalog");
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
  }

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.brand}>
            {view !== "home" && <button className={styles.back} type="button" onClick={() => setView("home")} aria-label="Voltar">←</button>}
            <div className={styles.logo}>📲</div>
            <div>
              <h1 className={styles.title}>{viewTitle(view)}</h1>
              <p className={styles.subtitle}>{session ? `Olá, ${session.user.firstName}` : "Telegram Mini App"}</p>
            </div>
          </div>
          <button className={styles.refresh} type="button" onClick={() => void loadSession()} disabled={loading}>{loading ? "…" : "↻"}</button>
        </header>

        {loading && <div className={styles.loading}>Validando sua sessão no Telegram…</div>}
        {error && <div className={styles.error}>{error}</div>}

        <PixGlobalMonitor
          active={Boolean(session) && view !== "pix"}
          onBalanceUpdated={refreshSessionSilently}
          onOpenPix={() => setView("pix")}
        />

        {session && view === "home" && <>
          <section className={styles.balanceCard} aria-label="Saldo da carteira">
            <div className={styles.balanceLabel}>Saldo disponível</div>
            <div className={styles.balanceValue}>{formatMoney(session.wallet.balanceCents, session.wallet.currency)}</div>
            <div className={styles.balanceMeta}>Carteira protegida por ledger transacional e idempotência.</div>
          </section>

          <section className={styles.grid} aria-label="Ações principais">
            <button className={styles.action} type="button" onClick={goCatalog}>
              <div className={styles.actionIcon}>📱</div>
              <span className={styles.actionTitle}>Comprar número</span>
              <span className={styles.actionText}>Escolher país e serviço no catálogo real</span>
            </button>
            <button className={styles.action} type="button" onClick={goCatalog}>
              <div className={styles.actionIcon}>🌎</div>
              <span className={styles.actionTitle}>Países e serviços</span>
              <span className={styles.actionText}>Catálogo e disponibilidade do SMSPool</span>
            </button>
            <button className={styles.action} type="button" onClick={() => setView("pix")}>
              <div className={styles.actionIcon}>💳</div>
              <span className={styles.actionTitle}>Recarregar</span>
              <span className={styles.actionText}>Adicionar saldo via PIX</span>
            </button>
            <button className={styles.action} type="button" onClick={() => setView("activations")}>
              <div className={styles.actionIcon}>📋</div>
              <span className={styles.actionTitle}>Minhas ativações</span>
              <span className={styles.actionText}>Acompanhar número, status e código SMS</span>
            </button>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Ativações recentes</h2>
              <span className={styles.badge}>{homeRecentList.length}/5</span>
            </div>
            <ActivationList activations={homeRecentList} currency={session.wallet.currency} compact />
          </section>
        </>}

        {session && view === "pix" && <>
          <PixRechargePanel
            onBalanceUpdated={refreshSessionSilently}
            onPaymentConfirmed={() => setView("home")}
          />
          <PixPaymentHistory refreshKey={session.wallet.balanceCents} />
        </>}

        {session && view === "catalog" && <SmsPoolCatalogPanel />}

        {session && view === "activations" && <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Acompanhe seus pedidos</h2>
            <span className={styles.badge}>{recentList.length} no histórico</span>
          </div>
          <ActivationTracking
            activations={recentList}
            currency={session.wallet.currency}
            autoRefreshActive={hasLiveActivation}
            refreshing={trackingRefreshing}
            onRefresh={() => void refreshActivations()}
          />
          <p className={styles.helper}>Exibimos até 20 ativações recentes. Enquanto houver um pedido aguardando número ou SMS, esta tela consulta o fornecedor automaticamente a cada 10 segundos.</p>
        </section>}

        <footer className={styles.footer}>
          Identidade validada no servidor pelo initData assinado do Telegram.<br />
          Catálogo real conectado. Compras e serviços seguem protegidos pelas travas comerciais e pela política de allow-list.
        </footer>
      </div>
    </main>
  );
}

function ActivationList({ activations, currency, compact = false }: { activations: Activation[]; currency: string; compact?: boolean }) {
  if (!activations.length) return <div className={styles.empty}>Você ainda não possui ativações.</div>;
  return <div className={styles.list}>{activations.map((activation) => <article className={styles.item} key={activation.id}>
    <div className={styles.itemTop}>
      <span className={styles.itemTitle}>{activation.kind === "TEMPORARY_HOSTING" ? "🗓" : "📱"} {kindLabel(activation.kind)}</span>
      <span className={styles.itemStatus}>{statusLabel(activation.status)}</span>
    </div>
    <div className={styles.itemMeta}>
      <strong>{activation.country} · {activation.product}</strong><br />
      {activation.phone ? `Número: ${activation.phone}` : "Número ainda não atribuído"}<br />
      {formatMoney(activation.salePriceCents, currency)} · criada em {formatDate(activation.createdAt)}
      {!compact && activation.expiresAt && <><br />Expira em {formatDate(activation.expiresAt)}</>}
    </div>
  </article>)}</div>;
}
