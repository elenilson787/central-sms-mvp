"use client";

import { useEffect, useState } from "react";
import styles from "../operations/operations.module.css";

type Log = {
  id: string;
  createdAt: string;
  actorType: string;
  actorId: string | null;
  actorName: string;
  action: string;
  actionLabel: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
};

type Payload = { ok: true; count: number; actions: string[]; logs: Log[]; generatedAt: string };

function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
}

function metadataText(metadata: Record<string, unknown>) {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined || value === "") continue;
    const shown = Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value);
    parts.push(`${key}: ${shown}`);
  }
  return parts.join(" · ");
}

export default function AdminHistoryPage() {
  const [token, setToken] = useState("");
  const [logs, setLogs] = useState<Log[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
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

  async function load() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (actor.trim()) params.set("actor", actor.trim());
      if (action) params.set("action", action);
      params.set("limit", "2000");
      const response = await fetch(`/api/admin/history?${params.toString()}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await response.json() as Payload | { error?: string };
      if (!response.ok || !("ok" in payload)) throw new Error((payload as { error?: string }).error ?? "Falha ao carregar histórico");
      setLogs(payload.logs);
      setActions(payload.actions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar histórico");
    } finally {
      setBusy(false);
    }
  }

  return <main className={styles.page}><div className={styles.wrap}>
    <div className={styles.header}>
      <div>
        <h1 className={styles.title}>Central SMS — Histórico completo</h1>
        <p className={styles.muted}>Auditoria sem limitar às últimas 24 horas: veja o que foi criado, alterado ou executado e qual ator registrou a ação.</p>
      </div>
      <a className={styles.link} href="/admin/operations">← Voltar à operação</a>
    </div>

    <section className={styles.panel}>
      <div className={styles.toolbar}>
        <input className={styles.input} type="password" value={token} onChange={(e) => rememberToken(e.target.value)} placeholder="ADMIN_API_TOKEN" autoComplete="off" />
        <input className={styles.input} type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="Data inicial" />
        <input className={styles.input} type="date" value={to} onChange={(e) => setTo(e.target.value)} title="Data final" />
      </div>
      <div className={styles.toolbar} style={{ marginTop: 10 }}>
        <input className={styles.input} value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Filtrar por ID do ator / Telegram" />
        <select className={styles.input} value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">Todas as ações</option>
          {actions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button className={styles.button} disabled={busy || !token} onClick={() => void load()}>{busy ? "Consultando…" : "Aplicar filtro"}</button>
        <button className={styles.button} disabled={busy} onClick={() => { setFrom(""); setTo(""); setActor(""); setAction(""); }}>{busy ? "…" : "Limpar filtros"}</button>
      </div>
      {error && <div className={styles.error}>{error}</div>}
      <p className={styles.muted} style={{ marginTop: 10 }}>
        Sem datas = <strong>todo o período disponível no audit_logs</strong>. O limite atual da consulta é 2.000 registros por vez.
      </p>
    </section>

    <section className={styles.panel}>
      <div className={styles.statusRow}>
        <h2 className={styles.sectionTitle}>Registros ({logs.length})</h2>
        <span className={styles.muted}>Inclui ações administrativas e eventos atribuídos a usuários.</span>
      </div>
      <div className={styles.tableWrap}><table className={styles.table}><thead>
        <tr><th>Data</th><th>Quem</th><th>O que fez</th><th>Objeto</th><th>Detalhes</th></tr>
      </thead><tbody>
        {logs.map((log) => <tr key={log.id}>
          <td>{dateTime(log.createdAt)}</td>
          <td><strong>{log.actorName}</strong><div className={styles.cardMeta}>{log.actorType}{log.actorId ? ` · ID ${log.actorId}` : ""}</div></td>
          <td><strong>{log.actionLabel}</strong><div className={styles.cardMeta}>{log.action}</div></td>
          <td>{log.entityType ?? "—"}{log.entityId ? <div className={styles.cardMeta}>{log.entityId}</div> : null}</td>
          <td>{metadataText(log.metadata) || "—"}</td>
        </tr>)}
        {!logs.length && <tr><td colSpan={5} className={styles.muted}>Nenhum registro para os filtros selecionados. Use sem datas para consultar todo o período.</td></tr>}
      </tbody></table></div>
    </section>
  </div></main>;
}
