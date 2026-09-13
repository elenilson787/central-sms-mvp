"use client";

import { useCallback, useEffect, useState } from "react";
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
  expiresAt?: string;
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
  if (view === "activations") return "Ativações";
  if (view === "pix") return "Recarregar via PIX";
  return "Central SMS";
}

export default function TelegramMiniAppPage() {
  const [session, setSession] = useState<MiniAppSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("home");

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    const webApp = window.Telegram?.WebApp;
    if (!webApp?.initData) {
      setError("Abra esta página pelo bot no Telegram para autenticar sua sessão.");
      setLoading(false);
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
      webApp.HapticFeedback?.notificationOccurred("success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível abrir sua sessão.");
      webApp?.HapticFeedback?.notificationOccurred("error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSession(); }, [loadSession]);

  function goCatalog() {
    setView("catalog");
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
  }

  const recentList = session?.recentActivations ?? [];

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
          onBalanceUpdated={loadSession}
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
              <span className={styles.actionTitle}>Ativações</span>
              <span className={styles.actionText}>Status, números e histórico recente</span>
            </button>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Ativações recentes</h2>
              <span className={styles.badge}>{recentList.length}/5</span>
            </div>
            <ActivationList activations={recentList} currency={session.wallet.currency} compact />
          </section>
        </>}

        {session && view === "pix" && <>
          <PixRechargePanel
            onBalanceUpdated={loadSession}
            onPaymentConfirmed={() => setView("home")}
          />
          <PixPaymentHistory refreshKey={session.wallet.balanceCents} />
        </>}

        {session && view === "catalog" && <SmsPoolCatalogPanel />}

        {session && view === "activations" && <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Suas ativações</h2>
            <span className={styles.badge}>{recentList.length} recentes</span>
          </div>
          <ActivationList activations={recentList} currency={session.wallet.currency} />
          <p className={styles.helper}>A sessão atual carrega as 5 ativações mais recentes. O histórico será expandido quando a compra real do provider for liberada.</p>
        </section>}

        <footer className={styles.footer}>
          Identidade validada no servidor pelo initData assinado do Telegram.<br />
          Catálogo real conectado. Compras permanecem desativadas até validação comercial do provider.
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
