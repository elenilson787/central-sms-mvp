"use client";

import { useEffect, useState } from "react";
import styles from "./operations.module.css";

type DashboardPayload = {
  ok: true;
  generatedAt: string;
  windowHours: number;
  metrics: {
    pixReceivedCents: number;
    pixRefundedCents: number;
    activationPurchases: number;
    activeUsers: number;
    smsRevenueCents: number;
    providerSpendUsd: number;
    estimatedProviderCostBrlCents: number;
    costConversionComplete: boolean;
    grossProfitCents: number;
    grossMarginPercent: number | null;
    smsReceived: number;
    activationRefunds: number;
    pendingActivations: number;
    realSuccessRate: number | null;
  };
  provider: { balance: number | null; currency: string; reserve: number; error: string | null };
  guardrails: {
    purchasesLastHour: number;
    purchasesLast24h: number;
    salesLast24hCents: number;
    providerSpendLast24hUsd: number;
    maxPurchasesPerHour: number;
    maxPurchasesPerDay: number;
    maxSalesLast24hCents: number;
    maxProviderSpendLast24hUsd: number;
    circuitBreakerOpen: boolean;
    circuitBreakerConsecutiveFailures: number;
    circuitBreakerFailureThreshold: number;
    circuitBreakerResetAt: string | null;
  };
  alerts: Array<{ level: "critical" | "warning" | "info"; code: string; message: string }>;
  recentActivity: Array<{ id: string; kind: "activation" | "pix"; title: string; status: string; amountCents: number; createdAt: string }>;
};

function brl(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
function usd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}
function percent(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1).replace(".0", "")}%`;
}
function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
function usage(value: number, limit: number) {
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.min(100, Math.max(0, (value / limit) * 100));
}

export default function OperationsPage() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const existing = window.sessionStorage.getItem("central_sms_admin_token");
    if (existing) setToken(existing);
  }, []);

  function rememberToken(value: string) {
    setToken(value);
    if (value) window.sessionStorage.setItem("central_sms_admin_token", value);
    else window.sessionStorage.removeItem("central_sms_admin_token");
  }

  async function loadDashboard() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/operations/dashboard", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await response.json() as DashboardPayload | { error?: string };
      if (!response.ok || !("ok" in payload)) throw new Error((payload as { error?: string }).error ?? "Falha ao carregar painel");
      setData(payload as DashboardPayload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar painel");
    } finally {
      setBusy(false);
    }
  }

  const g = data?.guardrails;
  const m = data?.metrics;

  return <main className={styles.page}><div className={styles.wrap}>
    <div className={styles.header}>
      <div>
        <h1 className={styles.title}>Central SMS — Operação do beta</h1>
        <p className={styles.muted}>Visão consolidada das últimas 24 horas para acompanhar caixa, vendas, custo, qualidade e travas de segurança.</p>
      </div>
      <a className={styles.link} href="/admin">← Voltar à administração</a>
    </div>

    <section className={styles.panel}>
      <div className={styles.toolbar}>
        <input className={styles.input} type="password" value={token} onChange={(event) => rememberToken(event.target.value)} placeholder="ADMIN_API_TOKEN" autoComplete="off" />
        <button className={styles.button} disabled={busy || !token} onClick={() => void loadDashboard()}>{busy ? "Atualizando…" : "Atualizar painel"}</button>
      </div>
      {error && <div className={styles.error}>{error}</div>}
      {data && <div className={styles.statusRow} style={{ marginTop: 10 }}>
        <span className={styles.muted}>Atualizado em {dateTime(data.generatedAt)}</span>
        <span className={styles.muted}>Janela: últimas {data.windowHours}h</span>
      </div>}
    </section>

    {data && m && <>
      <div className={styles.cards}>
        <div className={styles.card}><div className={styles.cardLabel}>PIX recebido</div><div className={styles.cardValue}>{brl(m.pixReceivedCents)}</div><div className={styles.cardMeta}>Reembolsos PIX: {brl(m.pixRefundedCents)}</div></div>
        <div className={styles.card}><div className={styles.cardLabel}>Vendas de SMS</div><div className={styles.cardValue}>{m.activationPurchases}</div><div className={styles.cardMeta}>{m.activeUsers} usuário(s) comprador(es)</div></div>
        <div className={styles.card}><div className={styles.cardLabel}>Receita SMS</div><div className={styles.cardValue}>{brl(m.smsRevenueCents)}</div><div className={styles.cardMeta}>Líquida de ativações reembolsadas</div></div>
        <div className={styles.card}><div className={styles.cardLabel}>Custo SMSPool</div><div className={styles.cardValue}>{usd(m.providerSpendUsd)}</div><div className={styles.cardMeta}>Estimado em BRL: {brl(m.estimatedProviderCostBrlCents)}</div></div>
        <div className={styles.card}><div className={styles.cardLabel}>Margem bruta</div><div className={styles.cardValue}>{percent(m.grossMarginPercent)}</div><div className={styles.cardMeta}>{brl(m.grossProfitCents)} de lucro bruto estimado</div></div>
        <div className={styles.card}><div className={styles.cardLabel}>SMS recebidos</div><div className={styles.cardValue}>{m.smsReceived}</div><div className={styles.cardMeta}>Ativações com código recebido/concluídas</div></div>
        <div className={styles.card}><div className={styles.cardLabel}>Reembolsadas</div><div className={styles.cardValue}>{m.activationRefunds}</div><div className={styles.cardMeta}>Ativações devolvidas pelo provider</div></div>
        <div className={styles.card}><div className={styles.cardLabel}>Taxa de sucesso real</div><div className={styles.cardValue}>{percent(m.realSuccessRate)}</div><div className={styles.cardMeta}>Pendentes agora: {m.pendingActivations}</div></div>
      </div>

      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>Alertas operacionais</h2>
        <div className={styles.alerts}>
          {data.alerts.map((alert) => <div key={alert.code} className={`${styles.alert} ${styles[alert.level]}`}>{alert.message}</div>)}
        </div>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>Capacidade e travas globais</h2>
        {g && <div className={styles.limits}>
          {[
            { label: "Compras na última hora", value: g.purchasesLastHour, limit: g.maxPurchasesPerHour, text: `${g.purchasesLastHour} / ${g.maxPurchasesPerHour}` },
            { label: "Compras nas últimas 24h", value: g.purchasesLast24h, limit: g.maxPurchasesPerDay, text: `${g.purchasesLast24h} / ${g.maxPurchasesPerDay}` },
            { label: "Vendas nas últimas 24h", value: g.salesLast24hCents, limit: g.maxSalesLast24hCents, text: `${brl(g.salesLast24hCents)} / ${brl(g.maxSalesLast24hCents)}` },
            { label: "Custo provider nas últimas 24h", value: g.providerSpendLast24hUsd, limit: g.maxProviderSpendLast24hUsd, text: `${usd(g.providerSpendLast24hUsd)} / ${usd(g.maxProviderSpendLast24hUsd)}` },
          ].map((item) => <div className={styles.limit} key={item.label}>
            <div className={styles.limitTop}><span>{item.label}</span><strong>{item.text}</strong></div>
            <div className={styles.track}><div className={styles.fill} style={{ width: `${usage(item.value, item.limit)}%` }} /></div>
          </div>)}
        </div>}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>Fornecedor e circuit breaker</h2>
        <div className={styles.providerGrid}>
          <div className={styles.providerItem}><span className={styles.muted}>Saldo SMSPool</span><strong>{data.provider.balance === null ? "Indisponível" : `${data.provider.balance.toFixed(2)} ${data.provider.currency}`}</strong></div>
          <div className={styles.providerItem}><span className={styles.muted}>Reserva mínima</span><strong>{data.provider.reserve.toFixed(2)} {data.provider.currency}</strong></div>
          <div className={styles.providerItem}><span className={styles.muted}>Circuit breaker</span><strong>{g?.circuitBreakerOpen ? "ABERTO" : "Fechado — normal"}</strong><div className={styles.cardMeta}>{g?.circuitBreakerConsecutiveFailures ?? 0}/{g?.circuitBreakerFailureThreshold ?? 0} falhas consecutivas</div></div>
        </div>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>Atividade recente</h2>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Tipo</th><th>Item</th><th>Status</th><th>Valor</th><th>Data</th></tr></thead><tbody>
          {data.recentActivity.map((item) => <tr key={`${item.kind}:${item.id}`}><td><span className={styles.badge}>{item.kind === "pix" ? "PIX" : "SMS"}</span></td><td>{item.title}</td><td>{item.status}</td><td>{brl(item.amountCents)}</td><td>{dateTime(item.createdAt)}</td></tr>)}
          {!data.recentActivity.length && <tr><td colSpan={5} className={styles.muted}>Nenhuma atividade nas últimas 24 horas.</td></tr>}
        </tbody></table></div>
      </section>
    </>}
  </div></main>;
}
