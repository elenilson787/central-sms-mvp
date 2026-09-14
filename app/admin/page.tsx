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

type TestPurchasePreview = {
  offer: {
    id: string;
    label: string;
    country: string;
    countryName: string;
    operator: string;
    product: string;
    providerPrice: number;
    providerCurrency: string;
  };
  selection?: { strategy: string };
  price: { salePriceCents: number | null; currency: string };
  stock: number;
  successRate: number | null;
  walletBalanceCents: number;
  projectedBalanceCents: number | null;
  policy: { serviceAllowed: boolean; blockReason: string | null };
  safety: { purchasesEnabled: boolean; commercialApproved: boolean; apiConfigured: boolean };
  canExecute: boolean;
  blockers: string[];
};

type TestPurchaseResponse = {
  ok?: boolean;
  mode?: "preview" | "policy_approved" | "executed";
  preview?: TestPurchasePreview;
  activation?: {
    id?: string;
    phone?: string | null;
    status?: string;
    external_activation_id?: string | null;
  };
  error?: string;
};

type PaymentFilter = "production" | "test" | "all";

function money(cents?: number | null) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents ?? 0) / 100);
}

function providerMoney(value: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

function successRate(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "não informada";
  const numeric = Number(value);
  const percent = numeric <= 1 ? numeric * 100 : numeric;
  return `${percent.toFixed(1).replace(".0", "")}%`;
}

function date(value?: string | null) {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("production");
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

  async function runControlledTestPurchase(user: AdminUser) {
    if (!token) return;
    setBusy(true); setError(null); setMessage(null);

    try {
      const previewResponse = await fetch("/api/admin/activations/test-purchase", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "preview", userId: user.id }),
      });
      const previewPayload = await previewResponse.json() as TestPurchaseResponse;
      if (!previewResponse.ok || !previewPayload.ok || !previewPayload.preview) {
        throw new Error(previewPayload.error ?? "Falha ao consultar a compra de teste");
      }

      const preview = previewPayload.preview;
      if (!preview.canExecute) {
        const onlyPolicyBlock = preview.blockers.length === 1
          && preview.policy.blockReason?.includes("SERVICE_NOT_APPROVED_FOR_SALE");

        if (onlyPolicyBlock) {
          const approve = window.confirm(
            `APROVAR DISCORD PARA O TESTE\n\n` +
            `Serviço: ${preview.offer.label}\n` +
            `Service ID do SMSPool: ${preview.offer.product}\n` +
            `País do teste: ${preview.offer.countryName}\n\n` +
            `Esta ação habilita SOMENTE este service ID do Discord na allow-list da Central SMS, ` +
            `na categoria standard. Nenhum número será comprado nesta etapa.\n\n` +
            `Deseja aprovar este serviço?`,
          );

          if (!approve) {
            setMessage("Aprovação do Discord cancelada. Nenhuma compra foi feita.");
            return;
          }

          const approvalResponse = await fetch("/api/admin/activations/test-purchase", {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
            body: JSON.stringify({
              action: "approve_service",
              userId: user.id,
              confirmation: "APPROVE_DISCORD_BR_STANDARD",
            }),
          });
          const approvalPayload = await approvalResponse.json() as TestPurchaseResponse;
          if (!approvalResponse.ok || !approvalPayload.ok) {
            throw new Error(approvalPayload.error ?? "Falha ao aprovar Discord para o teste");
          }

          setMessage("Discord aprovado na allow-list como serviço standard. Nenhuma compra foi feita. Clique novamente em ‘Testar Discord’ para revisar o melhor pool disponível e confirmar a compra.");
          return;
        }

        const details = preview.blockers.length ? preview.blockers.join(", ") : "TEST_PURCHASE_NOT_READY";
        throw new Error(`Compra teste bloqueada: ${details}`);
      }

      const salePrice = money(preview.price.salePriceCents);
      const providerPrice = providerMoney(preview.offer.providerPrice, preview.offer.providerCurrency);
      const projected = money(preview.projectedBalanceCents);
      const rate = successRate(preview.successRate);
      const confirmation = window.confirm(
        `COMPRA REAL DE TESTE — DISCORD\n\n` +
        `Usuário: ${user.first_name ?? user.username ?? user.telegram_user_id}\n` +
        `Serviço: ${preview.offer.label}\n` +
        `País: ${preview.offer.countryName}\n` +
        `Pool selecionado: ${preview.offer.operator}\n` +
        `Taxa de sucesso do pool: ${rate}\n` +
        `Critério: maior taxa de sucesso; menor preço como desempate\n` +
        `Preço para a carteira: ${salePrice}\n` +
        `Custo atual no SMSPool: ${providerPrice}\n` +
        `Estoque: ${preview.stock}\n` +
        `Saldo após a compra: ${projected}\n\n` +
        `Será comprado EXATAMENTE 1 número real deste pool. Deseja continuar?`,
      );
      if (!confirmation) {
        setMessage("Compra de teste cancelada antes de qualquer débito.");
        return;
      }

      const idempotencyKey = `admin-test:discord:${user.id}:${crypto.randomUUID()}`;
      const executeResponse = await fetch("/api/admin/activations/test-purchase", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: "execute",
          userId: user.id,
          idempotencyKey,
          expectedOfferId: preview.offer.id,
          confirmation: "BUY_ONE_REAL_DISCORD_BR",
        }),
      });
      const executePayload = await executeResponse.json() as TestPurchaseResponse;
      if (!executeResponse.ok || !executePayload.ok || !executePayload.activation) {
        if (executePayload.error === "OFFER_CHANGED_REVIEW_REQUIRED") {
          throw new Error("O melhor pool mudou desde a confirmação. Clique em ‘Testar Discord’ novamente para revisar os valores atualizados antes de comprar.");
        }
        throw new Error(executePayload.error ?? "Falha na compra real de teste");
      }

      const activation = executePayload.activation;
      await searchUsers();
      setMessage(
        `Compra real de teste do Discord criada com sucesso. ` +
        `Status: ${activation.status ?? "—"}. ` +
        `Número: ${activation.phone ?? "aguardando atribuição"}. ` +
        `Ativação: ${activation.id ?? "—"}.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha na compra real de teste");
    } finally {
      setBusy(false);
    }
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

    {users.map((user) => {
      const visiblePayments = (user.recentPayments ?? []).filter((payment) => paymentFilter === "all" || payment.environment === paymentFilter);
      return <section className={styles.card} key={user.id}>
        <div className={styles.grid}>
          <div><strong>{user.first_name ?? "Usuário"} {user.last_name ?? ""}</strong><br /><span className={styles.muted}>@{user.username ?? "sem_username"}</span></div>
          <div><strong>Telegram</strong><br />{user.telegram_user_id}</div>
          <div><strong>Saldo</strong><br />{money(user.wallet?.balance_cents)}</div>
          <div><strong>Status</strong><br /><span className={styles.badge}>{user.status}</span></div>
        </div>

        <div className={styles.testPurchase}>
          <div>
            <strong>🧪 Compra real controlada — Discord</strong>
            <p>Compara os pools disponíveis do Discord/Brasil, prioriza a maior taxa de sucesso e usa o menor preço como desempate. Só compra após confirmação explícita.</p>
          </div>
          <button className={`${styles.button} ${styles.testButton}`} disabled={busy || !token} onClick={() => void runControlledTestPurchase(user)}>
            {busy ? "Aguarde…" : "Testar Discord"}
          </button>
        </div>

        <div className={styles.row}>
          <h3 style={{ marginRight: "auto" }}>Recargas recentes</h3>
          <button className={styles.button} disabled={paymentFilter === "production"} onClick={() => setPaymentFilter("production")}>Produção</button>
          <button className={styles.button} disabled={paymentFilter === "test"} onClick={() => setPaymentFilter("test")}>Teste</button>
          <button className={styles.button} disabled={paymentFilter === "all"} onClick={() => setPaymentFilter("all")}>Todos</button>
        </div>
        <table className={styles.table}><thead><tr><th>Valor</th><th>Ambiente</th><th>Status</th><th>Data</th><th>Ação</th></tr></thead><tbody>
          {visiblePayments.length ? visiblePayments.map((payment) => <tr key={payment.id}>
            <td>{money(payment.amount_cents)}</td><td>{payment.environment}</td><td>{payment.status}</td><td>{date(payment.paid_at ?? payment.created_at)}</td>
            <td>{payment.environment === "production" && payment.status === "approved" ? <button className={`${styles.button} ${styles.danger}`} disabled={busy} onClick={() => void refund(payment)}>Reembolsar</button> : "—"}</td>
          </tr>) : <tr><td colSpan={5} className={styles.muted}>Nenhuma recarga neste ambiente.</td></tr>}
        </tbody></table>

        <h3>Ativações recentes</h3>
        <table className={styles.table}><thead><tr><th>Serviço</th><th>País</th><th>Status</th><th>Data</th></tr></thead><tbody>
          {(user.recentActivations ?? []).map((activation) => <tr key={activation.id}><td>{activation.product}</td><td>{activation.country}</td><td>{activation.status}</td><td>{date(activation.created_at)}</td></tr>)}
          {!(user.recentActivations ?? []).length && <tr><td colSpan={4} className={styles.muted}>Nenhuma ativação ainda.</td></tr>}
        </tbody></table>
      </section>;
    })}
  </div></main>;
}
