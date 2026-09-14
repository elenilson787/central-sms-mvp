"use client";

import { useEffect, useState } from "react";
import styles from "../../admin.module.css";

type RentalDiagnosticRow = {
  queryType: 0 | 1;
  id: string;
  name: string;
  region: string | null;
  serviceCount: number | null;
  sampleServices: string[];
  servicesError?: string;
  metadata: Record<string, string | number | boolean | null>;
};

type RentalDiagnosticGroup = {
  available: boolean;
  rows: RentalDiagnosticRow[];
  error: string | null;
};

type GlobalGuardrails = {
  ok: boolean;
  error: string | null;
  purchasesLastHour?: number;
  purchasesLast24h?: number;
  salesLast24hCents?: number;
  providerSpendLast24hUsd?: number;
  maxPurchasesPerHour?: number;
  maxPurchasesPerDay?: number;
  maxSalesLast24hCents?: number;
  maxProviderSpendLast24hUsd?: number;
  circuitBreakerOpen?: boolean;
  circuitBreakerConsecutiveFailures?: number;
  circuitBreakerFailureThreshold?: number;
  circuitBreakerWindowMinutes?: number;
  circuitBreakerResetAt?: string | null;
};

type Diagnostic = {
  ok: boolean;
  provider: string;
  configured: boolean;
  connection?: string;
  balance?: { value: number | null; currency: string };
  catalog?: {
    countries: number;
    services: number;
    sampleCountry: { id: string; name: string; code: string } | null;
    samplePricingCount: number;
    sample: Array<{
      serviceId: string;
      serviceName: string;
      countryId: string;
      countryName: string;
      countryCode: string;
      pool: string;
      providerPrice: number | null;
      providerCurrency: string;
    }>;
  };
  rentalDiagnostics?: {
    type0: RentalDiagnosticGroup;
    type1: RentalDiagnosticGroup;
  };
  globalGuardrails?: GlobalGuardrails;
  safety?: {
    purchasesEnabled: boolean;
    commercialApproved: boolean;
    livePurchasesAllowed: boolean;
    betaMode: boolean;
    betaMaxPurchasesPerHour: number;
    betaMaxPurchasesPerDay: number;
    betaMaxDailySpendBrlCents: number;
    betaMaxPendingActivations: number;
    betaMaxPendingPerService: number;
    betaGlobalMaxPurchasesPerHour: number;
    betaGlobalMaxPurchasesPerDay: number;
    betaGlobalMaxSalesBrlCentsPerDay: number;
    betaGlobalMaxProviderSpendUsdPerDay: number;
    betaCircuitBreakerFailures: number;
    betaCircuitBreakerWindowMinutes: number;
    smsPoolMinBalance: number;
    minimumSalePriceBrlCents: number;
    minimumGrossMarginPercent: number;
    minimumGrossMarginBrlCents: number;
  };
  error?: string;
};

function money(value: number | null | undefined, currency = "USD") {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

function cents(value: number | null | undefined) {
  return money(value === null || value === undefined ? null : value / 100, "BRL");
}

function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
}

function RentalTable({ title, group }: { title: string; group?: RentalDiagnosticGroup }) {
  const rows = group?.rows ?? [];
  return <>
    <h3>{title}</h3>
    {!group?.available && <div className={styles.muted}>
      {group?.error === "NO_RENTALS_AVAILABLE"
        ? "Nenhum aluguel disponível para este tipo na conta/provedor neste momento."
        : `Não foi possível consultar este tipo: ${group?.error ?? "sem resposta"}`}
    </div>}
    {group?.available && <table className={styles.table}><thead><tr><th>ID</th><th>Nome</th><th>Região</th><th>Serviços</th><th>Amostra</th><th>Metadados</th></tr></thead><tbody>
      {rows.map((row) => <tr key={`${row.queryType}-${row.id}`}>
        <td>{row.id}</td>
        <td>{row.name}</td>
        <td>{row.region ?? "—"}</td>
        <td>{row.serviceCount === null ? "erro" : row.serviceCount}</td>
        <td>{row.sampleServices.length ? row.sampleServices.join(", ") : row.servicesError ? row.servicesError : "—"}</td>
        <td><code>{JSON.stringify(row.metadata)}</code></td>
      </tr>)}
      {!rows.length && <tr><td colSpan={6} className={styles.muted}>Este tipo respondeu, mas não retornou opções.</td></tr>}
    </tbody></table>}
  </>;
}

export default function SmsPoolAdminPage() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<Diagnostic | null>(null);
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

  async function runDiagnostics() {
    if (!token) return;
    setBusy(true); setError(null); setData(null);
    try {
      const response = await fetch("/api/admin/providers/smspool/diagnostics", {
        headers: { authorization: `Bearer ${token}` },
      });
      const payload = await response.json() as Diagnostic;
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "SMSPOOL_DIAGNOSTICS_FAILED");
      setData(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao testar SMSPool");
    } finally {
      setBusy(false);
    }
  }

  return <main className={styles.page}><div className={styles.wrap}>
    <h1 className={styles.title}>Central SMS — SMSPool</h1>
    <p className={styles.muted}>Diagnóstico somente leitura. Esta página não compra números, não debita carteira e não altera saldo no provider.</p>

    <section className={styles.panel}>
      <div className={styles.row}>
        <input className={styles.input} type="password" value={token} onChange={(event) => rememberToken(event.target.value)} placeholder="ADMIN_API_TOKEN" autoComplete="off" />
        <button className={styles.button} disabled={!token || busy} onClick={() => void runDiagnostics()}>{busy ? "Testando…" : "Testar conexão SMSPool"}</button>
        <a className={styles.button} href="/admin" style={{ textDecoration: "none" }}>Voltar ao admin</a>
      </div>
      {error && <div className={styles.error}>{error}</div>}
    </section>

    {data && <>
      <section className={styles.card}>
        <h2>Conexão</h2>
        <div className={styles.grid}>
          <div><strong>Status</strong><br /><span className={styles.badge}>{data.connection === "ok" ? "Conectado" : data.connection}</span></div>
          <div><strong>Saldo SMSPool</strong><br />{money(data.balance?.value, data.balance?.currency)}</div>
          <div><strong>Países</strong><br />{data.catalog?.countries ?? 0}</div>
          <div><strong>Serviços</strong><br />{data.catalog?.services ?? 0}</div>
        </div>
      </section>

      <section className={styles.card}>
        <h2>Travas comerciais</h2>
        <div className={styles.grid}>
          <div><strong>PURCHASES_ENABLED</strong><br /><span className={styles.badge}>{String(data.safety?.purchasesEnabled)}</span></div>
          <div><strong>SMSPOOL_COMMERCIAL_APPROVED</strong><br /><span className={styles.badge}>{String(data.safety?.commercialApproved)}</span></div>
          <div><strong>Compra real liberada</strong><br /><span className={styles.badge}>{String(data.safety?.livePurchasesAllowed)}</span></div>
          <div><strong>Modo beta público</strong><br /><span className={styles.badge}>{String(data.safety?.betaMode)}</span></div>
        </div>
        <p className={styles.muted}>O beta público não exige cadastro prévio de usuários. As compras ficam protegidas por limites por usuário, orçamento global, margem mínima, reserva de saldo e circuit breaker.</p>
      </section>

      <section className={styles.card}>
        <h2>Limites por usuário</h2>
        <div className={styles.grid}>
          <div><strong>Compras por hora</strong><br />{data.safety?.betaMaxPurchasesPerHour ?? "—"}</div>
          <div><strong>Compras por 24h</strong><br />{data.safety?.betaMaxPurchasesPerDay ?? "—"}</div>
          <div><strong>Gasto por 24h</strong><br />{cents(data.safety?.betaMaxDailySpendBrlCents)}</div>
          <div><strong>Pendentes totais</strong><br />{data.safety?.betaMaxPendingActivations ?? "—"}</div>
          <div><strong>Pendentes por serviço</strong><br />{data.safety?.betaMaxPendingPerService ?? "—"}</div>
          <div><strong>Reserva SMSPool</strong><br />{money(data.safety?.smsPoolMinBalance, data.balance?.currency ?? "USD")}</div>
          <div><strong>Preço mínimo</strong><br />{cents(data.safety?.minimumSalePriceBrlCents)}</div>
          <div><strong>Margem mínima</strong><br />{data.safety?.minimumGrossMarginPercent ?? "—"}% + {cents(data.safety?.minimumGrossMarginBrlCents)}</div>
        </div>
      </section>

      <section className={styles.card}>
        <h2>Orçamento global do beta</h2>
        {!data.globalGuardrails?.ok && <div className={styles.error}>
          Não foi possível calcular os limites globais: {data.globalGuardrails?.error ?? "sem resposta"}
        </div>}
        {data.globalGuardrails?.ok && <>
          <div className={styles.grid}>
            <div><strong>Compras na última hora</strong><br />{data.globalGuardrails.purchasesLastHour ?? 0} / {data.globalGuardrails.maxPurchasesPerHour ?? data.safety?.betaGlobalMaxPurchasesPerHour ?? "—"}</div>
            <div><strong>Compras nas últimas 24h</strong><br />{data.globalGuardrails.purchasesLast24h ?? 0} / {data.globalGuardrails.maxPurchasesPerDay ?? data.safety?.betaGlobalMaxPurchasesPerDay ?? "—"}</div>
            <div><strong>Vendas nas últimas 24h</strong><br />{cents(data.globalGuardrails.salesLast24hCents)} / {cents(data.globalGuardrails.maxSalesLast24hCents)}</div>
            <div><strong>Custo provider nas últimas 24h</strong><br />{money(data.globalGuardrails.providerSpendLast24hUsd, "USD")} / {money(data.globalGuardrails.maxProviderSpendLast24hUsd, "USD")}</div>
          </div>
          <p className={styles.muted}>Os limites globais valem para todos os usuários somados e impedem que tráfego inesperado consuma o saldo do provider além do orçamento do beta.</p>
        </>}
      </section>

      <section className={styles.card}>
        <h2>Circuit breaker</h2>
        <div className={styles.grid}>
          <div><strong>Status</strong><br /><span className={styles.badge}>{data.globalGuardrails?.circuitBreakerOpen ? "ABERTO — compras pausadas" : "Fechado — normal"}</span></div>
          <div><strong>Falhas consecutivas</strong><br />{data.globalGuardrails?.circuitBreakerConsecutiveFailures ?? 0} / {data.globalGuardrails?.circuitBreakerFailureThreshold ?? data.safety?.betaCircuitBreakerFailures ?? "—"}</div>
          <div><strong>Janela observada</strong><br />{data.globalGuardrails?.circuitBreakerWindowMinutes ?? data.safety?.betaCircuitBreakerWindowMinutes ?? "—"} min</div>
          <div><strong>Reabertura automática</strong><br />{data.globalGuardrails?.circuitBreakerOpen ? dateTime(data.globalGuardrails.circuitBreakerResetAt) : "Não aplicável"}</div>
        </div>
        <p className={styles.muted}>Se ocorrerem falhas ou reembolsos consecutivos suficientes dentro da janela configurada, novas compras são pausadas automaticamente. O circuito fecha sozinho quando a sequência sai da janela.</p>
      </section>

      <section className={styles.card}>
        <h2>Diagnóstico Rental</h2>
        <p className={styles.muted}>Compara as respostas reais de <code>retrieve_all</code> com type=0 e type=1. Se um tipo não tiver rentals, ele aparece como indisponível sem derrubar o diagnóstico do outro.</p>
        <RentalTable title="Rental type=0" group={data.rentalDiagnostics?.type0} />
        <RentalTable title="Rental type=1" group={data.rentalDiagnostics?.type1} />
      </section>

      <section className={styles.card}>
        <h2>Amostra do catálogo real</h2>
        <p className={styles.muted}>País de amostra: {data.catalog?.sampleCountry ? `${data.catalog.sampleCountry.name} (${data.catalog.sampleCountry.code})` : "—"}. Preços abaixo são valores brutos do provider; ainda não são preços de venda da Central SMS.</p>
        <table className={styles.table}><thead><tr><th>Serviço</th><th>Pool</th><th>Preço provider</th></tr></thead><tbody>
          {(data.catalog?.sample ?? []).map((item) => <tr key={`${item.serviceId}-${item.pool}`}><td>{item.serviceName}</td><td>{item.pool}</td><td>{money(item.providerPrice, item.providerCurrency)}</td></tr>)}
          {!(data.catalog?.sample?.length) && <tr><td colSpan={3} className={styles.muted}>Nenhum preço retornado para a amostra.</td></tr>}
        </tbody></table>
      </section>
    </>}
  </div></main>;
}
