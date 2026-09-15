"use client";

import { useEffect, useState } from "react";
import styles from "../../../admin.module.css";

type ServiceRow = {
  label: string;
  providerAvailable: boolean;
  product: string | null;
  serviceName: string | null;
  poolCount: number;
  minProviderPrice: number | null;
  complianceBlockReason: string | null;
  enabled: boolean;
  riskCategory: string | null;
  notes: string | null;
  blockedByRiskCategory: boolean;
};

type Payload = {
  ok?: boolean;
  country?: string;
  services?: ServiceRow[];
  changed?: number;
  error?: string;
};

function providerPrice(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(value);
}

export default function SmsPoolServicePoliciesPage() {
  const [token, setToken] = useState("");
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const existing = window.sessionStorage.getItem("central_sms_admin_token");
    if (existing) setToken(existing);
  }, []);

  function rememberToken(value: string) {
    setToken(value);
    if (value) window.sessionStorage.setItem("central_sms_admin_token", value);
    else window.sessionStorage.removeItem("central_sms_admin_token");
  }

  async function request(body?: Record<string, unknown>) {
    if (!token) throw new Error("Informe o ADMIN_API_TOKEN.");
    const response = await fetch("/api/admin/providers/smspool/service-policies", {
      method: body ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json() as Payload;
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? "SERVICE_POLICY_REQUEST_FAILED");
    return payload;
  }

  async function load() {
    setBusy(true); setError(null); setMessage(null);
    try {
      const payload = await request();
      setRows(payload.services ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao consultar serviços.");
    } finally {
      setBusy(false);
    }
  }

  async function approveRecommended() {
    setBusy(true); setError(null); setMessage(null);
    try {
      const payload = await request({ action: "approve_recommended" });
      setRows(payload.services ?? []);
      setMessage(`${payload.changed ?? 0} serviço(s) recomendado(s) aprovado(s).`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao aprovar serviços recomendados.");
    } finally {
      setBusy(false);
    }
  }

  async function setService(row: ServiceRow, enabled: boolean) {
    if (!row.product) return;
    setChanging(row.product); setError(null); setMessage(null);
    try {
      const payload = await request({ action: "set", product: row.product, enabled });
      setRows(payload.services ?? []);
      setMessage(`${row.label} ${enabled ? "aprovado" : "desativado"}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao alterar serviço.");
    } finally {
      setChanging(null);
    }
  }

  return <main className={styles.page}><div className={styles.wrap}>
    <h1 className={styles.title}>Central SMS — Serviços populares</h1>
    <p className={styles.muted}>
      Gerencie a allow-list dos serviços populares encontrados no catálogo do SMSPool para o Brasil. Aprovar aqui não compra números nem altera saldo; estoque e preço final continuam sendo revalidados na cotação e na compra.
    </p>

    <section className={styles.panel}>
      <div className={styles.row}>
        <input className={styles.input} type="password" value={token} onChange={(event) => rememberToken(event.target.value)} placeholder="ADMIN_API_TOKEN" autoComplete="off" />
        <button className={styles.button} disabled={!token || busy} onClick={() => void load()}>{busy ? "Consultando…" : "Consultar Brasil"}</button>
        <a className={styles.button} href="/admin/providers/smspool" style={{ textDecoration: "none" }}>Voltar ao SMSPool</a>
      </div>
      {error && <div className={styles.error}>{error}</div>}
      {message && <div className={styles.success}>{message}</div>}
    </section>

    {rows.length > 0 && <section className={styles.card}>
      <h2>Allow-list do beta — Brasil</h2>
      <p className={styles.muted}>
        O botão abaixo aprova somente serviços populares que existem no catálogo brasileiro e passam pelo filtro de compliance. Categorias financeiras, cripto, governo, KYC, operadoras, fraude e serviços que exigem whitelist continuam bloqueados.
      </p>
      <div className={styles.row}>
        <button className={styles.button} disabled={busy || Boolean(changing)} onClick={() => void approveRecommended()}>
          Aprovar recomendados disponíveis
        </button>
      </div>

      <table className={styles.table}>
        <thead><tr><th>Serviço</th><th>Catálogo Brasil</th><th>ID</th><th>Rotas</th><th>Preço provider</th><th>Política</th><th>Ação</th></tr></thead>
        <tbody>
          {rows.map((row) => <tr key={row.label}>
            <td><strong>{row.label}</strong>{row.serviceName && row.serviceName !== row.label ? <><br /><span className={styles.muted}>{row.serviceName}</span></> : null}</td>
            <td>{row.providerAvailable ? <span className={styles.badge}>Encontrado</span> : <span className={styles.muted}>Não encontrado</span>}</td>
            <td>{row.product ?? "—"}</td>
            <td>{row.poolCount || "—"}</td>
            <td>{providerPrice(row.minProviderPrice)}</td>
            <td>
              {row.blockedByRiskCategory || row.complianceBlockReason
                ? <span className={styles.muted}>Bloqueado por compliance</span>
                : row.enabled
                  ? <span className={styles.badge}>Aprovado</span>
                  : <span className={styles.muted}>Não aprovado</span>}
              {row.riskCategory ? <><br /><span className={styles.muted}>{row.riskCategory}</span></> : null}
            </td>
            <td>
              {row.product && row.providerAvailable && !row.blockedByRiskCategory && !row.complianceBlockReason
                ? <button
                    className={styles.button}
                    disabled={changing === row.product || busy}
                    onClick={() => void setService(row, !row.enabled)}
                  >
                    {changing === row.product ? "Salvando…" : row.enabled ? "Desativar" : "Aprovar"}
                  </button>
                : "—"}
            </td>
          </tr>)}
        </tbody>
      </table>
    </section>}
  </div></main>;
}
