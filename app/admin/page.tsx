"use client";

import { useEffect, useState } from "react";
import styles from "./admin.module.css";

type Payment = {
  id: string;
  environment: string;
  amount_cents: number;
  status: string;
  created_at: string;
  paid_at?: string | null;
};

type AdminUser = {
  id: string;
  telegram_user_id: string | number;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  status: string;
  created_at: string;
  wallet?: { balance_cents: number; currency: string } | null;
  recentPayments?: Payment[];
  recentActivations?: Array<{ id: string; provider: string; country: string; product: string; status: string; created_at: string }>;
};

function money(cents?: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents ?? 0) / 100);
}

function date(value?: string | null) {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
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

  async function searchUsers() {
    if (!token || !query.trim()) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/admin/users/search", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: query.trim() }),
      });
      const payload = await response.json() as { users?: AdminUser[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Falha na consulta");
      setUsers(payload.users ?? []);
      if (!(payload.users ?? []).length) setMessage("Nenhum usuário encontrado.");
    } catch (cause) {
      setUsers([]);
      setError(cause instanceof Error ? cause.message : "Falha na consulta");
    } finally { setBusy(false); }
  }

  async function refund(payment: Payment) {
    if (payment.environment !== "production" || payment.status !== "approved") return;
    const reason = window.prompt(`Motivo do reembolso integral de ${money(payment.amount_cents)}:`)?.trim();
    if (!reason) return;
    if (!window.confirm("Confirmar reembolso integral? O saldo correspondente será reservado da carteira antes da chamada ao Mercado Pago.")) return;

    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/admin/payments/refund", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ paymentId: payment.id, reason, idempotencyKey: crypto.randomUUID() }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; amountCents?: number; refundId?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Falha ao reembolsar");
      setMessage(`Reembolso processado: ${money(payload.amountCents)}.`);
      await searchUsers();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao reembolsar");
    } finally { setBusy(false); }
  }

  return <main className={styles.page}><div className={styles.wrap}>
    <h1 className={styles.title}>Central SMS — Administração</h1>
    <p className={styles.muted}>Console operacional. O token fica somente na sessão desta aba e nunca deve ser compartilhado.</p>

    <section className={styles.panel}>
      <div className={styles.row}>
        <input className={styles.input} type="password" value={token} onChange={(e) => rememberToken(e.target.value)} placeholder="ADMIN_API_TOKEN" autoComplete="off" />
        <input className={styles.input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Telegram ID, UUID ou @username" onKeyDown={(e) => { if (e.key === "Enter") void searchUsers(); }} />
        <button className={styles.button} disabled={busy || !token || !query.trim()} onClick={() => void searchUsers()}>{busy ? "Aguarde…" : "Buscar"}</button>
      </div>
      {message && <div className={styles.ok}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}
    </section>

    {users.map((user) => <section className={styles.card} key={user.id}>
      <div className={styles.grid}>
        <div><strong>{user.first_name ?? "Usuário"} {user.last_name ?? ""}</strong><br /><span className={styles.muted}>@{user.username ?? "sem_username"}</span></div>
        <div><strong>Telegram</strong><br />{user.telegram_user_id}</div>
        <div><strong>Saldo</strong><br />{money(user.wallet?.balance_cents)}</div>
        <div><strong>Status</strong><br /><span className={styles.badge}>{user.status}</span></div>
      </div>

      <h3>Recargas recentes</h3>
      <table className={styles.table}><thead><tr><th>Valor</th><th>Ambiente</th><th>Status</th><th>Data</th><th>Ação</th></tr></thead><tbody>
        {(user.recentPayments ?? []).map((payment) => <tr key={payment.id}>
          <td>{money(payment.amount_cents)}</td><td>{payment.environment}</td><td>{payment.status}</td><td>{date(payment.paid_at ?? payment.created_at)}</td>
          <td>{payment.environment === "production" && payment.status === "approved" ? <button className={`${styles.button} ${styles.danger}`} disabled={busy} onClick={() => void refund(payment)}>Reembolsar</button> : "—"}</td>
        </tr>)}
      </tbody></table>

      <h3>Ativações recentes</h3>
      <table className={styles.table}><thead><tr><th>Serviço</th><th>País</th><th>Status</th><th>Data</th></tr></thead><tbody>
        {(user.recentActivations ?? []).map((activation) => <tr key={activation.id}><td>{activation.product}</td><td>{activation.country}</td><td>{activation.status}</td><td>{date(activation.created_at)}</td></tr>)}
      </tbody></table>
    </section>)}
  </div></main>;
}
