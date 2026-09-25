"use client";

import { useEffect, useState } from "react";
import styles from "../operations/operations.module.css";

type Log = {
  id: string; createdAt: string; actorType: string; actorId: string | null; actorName: string;
  action: string; actionLabel: string; entityType: string | null; entityId: string | null; metadata: Record<string, unknown>;
};
type UserRow = {
  userId: string; name: string; username: string | null; telegramUserId: string | null;
  depositedCents: number; depositCount: number; lastDepositAt: string | null; spentCents: number; purchaseCount: number; balanceMovementCents: number;
};
type Payload = {
  ok: true; count: number; actions: string[]; logs: Log[]; users: UserRow[]; deposits: DepositRow[];
  period: { from: string | null; to: string | null; label: string };
  deposits: DepositRow[];\n  categories: {
    financeiro: { deposits: number; depositors: number; refunds: number };
    compras: { purchases: number; spent: number; smsReceived: number };
    usuarios: { distinctUsers: number; usersWithFinancialActivity: number };
    auditoria: { records: number };
  };
};

type DepositRow = { id: string; userId: string; userName: string; username: string | null; telegramUserId: string | null; amountCents: number; cumulativeCents: number; createdAt: string };\n\nconst money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const integer = (value: number) => new Intl.NumberFormat("pt-BR").format(value);
const dateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));

function metadataText(metadata: Record<string, unknown>) {
  return Object.entries(metadata).filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value)}`).join(" · ");
}

export default function AdminHistoryPage() {
  const [token, setToken] = useState("");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);

  useEffect(() => {
    const existing = window.sessionStorage.getItem("central_sms_admin_token");
    if (existing) { setToken(existing); }
  }, []);

  function rememberToken(value: string) {
    setToken(value);
    if (value) window.sessionStorage.setItem("central_sms_admin_token", value);
    else window.sessionStorage.removeItem("central_sms_admin_token");
  }

  async function load(nextFrom = from, nextTo = to) {
    if (!token) return;
    setBusy(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (nextFrom) params.set("from", nextFrom);
      if (nextTo) params.set("to", nextTo);
      if (actor.trim()) params.set("actor", actor.trim());
      if (action) params.set("action", action);
      params.set("limit", "2000");
      const response = await fetch(`/api/admin/history?${params.toString()}`, {
        headers: { authorization: `Bearer ${token}` }, cache: "no-store",
      });
      const data = await response.json() as Payload | { error?: string };
      if (!response.ok || !("ok" in data)) throw new Error((data as { error?: string }).error ?? "Falha ao carregar histórico");
      setPayload(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar histórico");
    } finally { setBusy(false); }
  }

  function clearFilters() {
    setFrom(""); setTo(""); setActor(""); setAction("");
    void load("", "");
  }

  const c = payload?.categories;
  return <main className={styles.page}><div className={styles.wrap}>
    <div className={styles.header}>
      <div>
        <h1 className={styles.title}>Central SMS — Histórico e financeiro</h1>
        <p className={styles.muted}>Visão consolidada por categoria, com números do período e identificação dos usuários. A auditoria detalhada fica separada abaixo.</p>
      </div>
      <a className={styles.link} href="/admin/operations">← Voltar à operação</a>
    </div>

    <section className={styles.panel}>
      <div className={styles.toolbar}>
        <input className={styles.input} type="password" value={token} onChange={(e) => rememberToken(e.target.value)} placeholder="ADMIN_API_TOKEN" autoComplete="off" />
        <input className={styles.input} type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="Data inicial" />
        <input className={styles.input} type="date" value={to} onChange={(e) => setTo(e.target.value)} title="Data final" />
        <button className={styles.button} disabled={busy || !token} onClick={() => void load()}>{busy ? "Consultando…" : "Aplicar período"}</button>
        <button className={styles.button} disabled={busy || !token} onClick={clearFilters}>Todo o período</button>
      </div>
      <div className={styles.toolbar} style={{ marginTop: 10 }}>
        <input className={styles.input} value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Filtrar auditoria por ID / Telegram" />
        <select className={styles.input} value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">Todas as ações</option>
          {(payload?.actions ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button className={styles.button} disabled={busy || !token} onClick={() => void load()}>Atualizar</button>
      </div>
      {error && <div className={styles.error}>{error}</div>}
      <p className={styles.muted} style={{ marginTop: 10 }}>
        <strong>{payload?.period.label ?? "Todo o período"}</strong>. Os indicadores financeiros usam PIX aprovados e compras de SMS registradas no sistema.
      </p>
    </section>

    {c && <section className={styles.panel}>
      <h2 className={styles.sectionTitle}>Indicadores do período</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginTop: 14 }}>
        <div className={styles.card}><div className={styles.muted}>Pessoas distintas no bot</div><div className={styles.metric}>{integer(c.usuarios.distinctUsers)}</div><div className={styles.cardMeta}>usuários cadastrados no app</div></div>
        <div className={styles.card}><div className={styles.muted}>Pessoas que depositaram</div><div className={styles.metric}>{integer(c.financeiro.depositors)}</div><div className={styles.cardMeta}>com PIX aprovado</div></div>
        <div className={styles.card}><div className={styles.muted}>Total colocado</div><div className={styles.metric}>{money(c.financeiro.deposits)}</div><div className={styles.cardMeta}>depósitos aprovados</div></div>
        <div className={styles.card}><div className={styles.muted}>Total gasto em SMS</div><div className={styles.metric}>{money(c.compras.spent)}</div><div className={styles.cardMeta}>{integer(c.compras.purchases)} compras</div></div>
        <div className={styles.card}><div className={styles.muted}>SMS recebidos</div><div className={styles.metric}>{integer(c.compras.smsReceived)}</div><div className={styles.cardMeta}>ativações com código</div></div>
        <div className={styles.card}><div className={styles.muted}>Reembolsos PIX</div><div className={styles.metric}>{money(c.financeiro.refunds)}</div><div className={styles.cardMeta}>concluídos</div></div>
      </div>
    </section>}

    {payload && <section className={styles.panel}>
      <div className={styles.statusRow}>
        <div><h2 className={styles.sectionTitle}>Movimentação por usuário</h2><p className={styles.muted}>Quem colocou dinheiro, quanto colocou, quanto gastou e quantas compras fez.</p></div>
        <span className={styles.muted}>{integer(payload.users.length)} com atividade financeira</span>
      </div>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr>
        <th>Usuário</th><th>Telegram</th><th>Colocou</th><th>Depósitos</th><th>Última recarga</th><th>Gastou</th><th>Compras</th><th>Diferença</th>
      </tr></thead><tbody>
        {payload.users.map((user) => <tr key={user.userId}>
          <td><strong>{user.name}</strong>{user.username ? <div className={styles.cardMeta}>@{user.username}</div> : null}</td>
          <td>{user.telegramUserId ?? "—"}</td><td>{money(user.depositedCents)}</td><td>{integer(user.depositCount)}</td>
          <td>{user.lastDepositAt ? dateTime(user.lastDepositAt) : "—"}</td><td>{money(user.spentCents)}</td><td>{integer(user.purchaseCount)}</td><td>{money(user.balanceMovementCents)}</td>
        </tr>)}
        {!payload.users.length && <tr><td colSpan={8} className={styles.muted}>Nenhum usuário com movimentação financeira neste período.</td></tr>}
      </tbody></table></div>
    </section>}

    {payload && <section className={styles.panel}>
      <div className={styles.statusRow}>
        <div><h2 className={styles.sectionTitle}>Categorias</h2><p className={styles.muted}>Separação rápida para não misturar operações técnicas com dinheiro e compras.</p></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>
        <div className={styles.card}><h3>💰 Financeiro</h3><p>PIX aprovados: <strong>{money(c!.financeiro.deposits)}</strong></p><p>Depositantes: <strong>{integer(c!.financeiro.depositors)}</strong></p><p>Reembolsos: <strong>{money(c!.financeiro.refunds)}</strong></p></div>
        <div className={styles.card}><h3>📱 Compras SMS</h3><p>Gasto dos usuários: <strong>{money(c!.compras.spent)}</strong></p><p>Compras: <strong>{integer(c!.compras.purchases)}</strong></p><p>SMS recebidos: <strong>{integer(c!.compras.smsReceived)}</strong></p></div>
        <div className={styles.card}><h3>👥 Usuários</h3><p>Pessoas no bot: <strong>{integer(c!.usuarios.distinctUsers)}</strong></p><p>Com atividade financeira: <strong>{integer(c!.usuarios.usersWithFinancialActivity)}</strong></p></div>
        <div className={styles.card}><h3>🧾 Auditoria</h3><p>Registros técnicos: <strong>{integer(c!.auditoria.records)}</strong></p><p className={styles.cardMeta}>Consultados separadamente abaixo.</p></div>
      </div>
    </section>}

    <section className={styles.panel}>
      <div className={styles.statusRow}>
        <div><h2 className={styles.sectionTitle}>Auditoria detalhada</h2><p className={styles.muted}>A lista técnica continua disponível, mas fica recolhida para não poluir o painel financeiro.</p></div>
        <button className={styles.button} onClick={() => setShowAudit((v) => !v)}>{showAudit ? "Ocultar ações" : "Mostrar ações"}</button>
      </div>
      {showAudit && <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Data</th><th>Quem</th><th>Ação</th><th>Objeto</th><th>Detalhes</th></tr></thead><tbody>
        {(payload?.logs ?? []).map((log) => <tr key={log.id}>
          <td>{dateTime(log.createdAt)}</td><td><strong>{log.actorName}</strong><div className={styles.cardMeta}>{log.actorType}{log.actorId ? ` · ID ${log.actorId}` : ""}</div></td>
          <td><strong>{log.actionLabel}</strong><div className={styles.cardMeta}>{log.action}</div></td><td>{log.entityType ?? "—"}{log.entityId ? <div className={styles.cardMeta}>{log.entityId}</div> : null}</td>
          <td>{metadataText(log.metadata) || "—"}</td>
        </tr>)}
      </tbody></table></div>}
    </section>
  </div></main>;
}
