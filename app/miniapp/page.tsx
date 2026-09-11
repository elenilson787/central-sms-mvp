"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./page.module.css";

type MiniAppSession = {
  user: {
    id: string;
    telegramUserId: number;
    username?: string;
    firstName: string;
    lastName?: string;
  };
  wallet: {
    balanceCents: number;
    currency: string;
  };
  recentActivations: Array<{
    id: string;
    kind: "ONE_TIME_SMS" | "TEMPORARY_HOSTING";
    country: string;
    product: string;
    phone?: string;
    status: string;
    salePriceCents: number;
    createdAt: string;
    expiresAt?: string;
  }>;
};

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function actionMessage(title: string) {
  const webApp = window.Telegram?.WebApp;
  webApp?.HapticFeedback?.impactOccurred("light");
  webApp?.showPopup({
    title,
    message: "Esta etapa da Mini App já está preparada na interface. A operação real será habilitada somente após conectarmos e validarmos o provider correspondente.",
    buttons: [{ type: "ok" }],
  });
}

export default function TelegramMiniAppPage() {
  const [session, setSession] = useState<MiniAppSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      const payload = await response.json() as { ok?: boolean; session?: MiniAppSession; error?: string };
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

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const actions = [
    { icon: "📱", title: "Comprar número", text: "Ativação curta ou número temporário", onClick: () => actionMessage("Comprar número") },
    { icon: "🌎", title: "Países e serviços", text: "Catálogo aprovado e disponibilidade", onClick: () => actionMessage("Países e serviços") },
    { icon: "💳", title: "Recarregar", text: "Adicionar saldo via PIX", onClick: () => actionMessage("Recarregar saldo") },
    { icon: "📋", title: "Ativações", text: "Histórico e SMS recebidos", onClick: () => document.getElementById("recent-activations")?.scrollIntoView({ behavior: "smooth" }) },
  ];

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <div className={styles.logo}>📲</div>
            <div>
              <h1 className={styles.title}>Central SMS</h1>
              <p className={styles.subtitle}>{session ? `Olá, ${session.user.firstName}` : "Telegram Mini App"}</p>
            </div>
          </div>
          <button className={styles.refresh} type="button" onClick={() => void loadSession()} disabled={loading}>
            {loading ? "…" : "↻"}
          </button>
        </header>

        {loading && <div className={styles.loading}>Validando sua sessão no Telegram…</div>}
        {error && <div className={styles.error}>{error}</div>}

        {session && (
          <>
            <section className={styles.balanceCard} aria-label="Saldo da carteira">
              <div className={styles.balanceLabel}>Saldo disponível</div>
              <div className={styles.balanceValue}>{formatMoney(session.wallet.balanceCents, session.wallet.currency)}</div>
              <div className={styles.balanceMeta}>Carteira protegida por ledger transacional e idempotência.</div>
            </section>

            <section className={styles.grid} aria-label="Ações principais">
              {actions.map((action) => (
                <button className={styles.action} type="button" key={action.title} onClick={action.onClick}>
                  <div className={styles.actionIcon}>{action.icon}</div>
                  <span className={styles.actionTitle}>{action.title}</span>
                  <span className={styles.actionText}>{action.text}</span>
                </button>
              ))}
            </section>

            <section className={styles.section} id="recent-activations">
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Ativações recentes</h2>
                <span className={styles.badge}>{session.recentActivations.length}/5</span>
              </div>

              <div className={styles.list}>
                {session.recentActivations.length === 0 && (
                  <div className={styles.empty}>Você ainda não possui ativações.</div>
                )}
                {session.recentActivations.map((activation) => (
                  <article className={styles.item} key={activation.id}>
                    <div className={styles.itemTop}>
                      <span className={styles.itemTitle}>
                        {activation.kind === "TEMPORARY_HOSTING" ? "🗓 Número temporário" : "📱 Ativação curta"}
                      </span>
                      <span className={styles.itemStatus}>{activation.status}</span>
                    </div>
                    <div className={styles.itemMeta}>
                      {activation.country} · {activation.product}<br />
                      {activation.phone ? `${activation.phone} · ` : ""}{formatMoney(activation.salePriceCents, session.wallet.currency)}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        <footer className={styles.footer}>
          A identidade da sessão é validada no servidor usando o initData assinado pelo Telegram.<br />
          Compras reais permanecem desativadas até a validação comercial dos providers.
        </footer>
      </div>
    </main>
  );
}
