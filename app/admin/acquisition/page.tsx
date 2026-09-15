"use client";

import { useEffect, useState } from "react";
import styles from "../operations/operations.module.css";

type AcquisitionPayload = {
  ok: true;
  generatedAt: string;
  windowHours: number;
  attribution: string;
  totals: {
    arrivals: number;
    appOpens: number;
    rechargers: number;
    pixCents: number;
    buyers: number;
    revenueCents: number;
    botToAppPercent: number | null;
    appToBuyerPercent: number | null;
  };
  sources: Array<{
    source: string;
    arrivals: number;
    appOpens: number;
    rechargers: number;
    pixCents: number;
    buyers: number;
    revenueCents: number;
  }>;
};

function brl(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function percent(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1).replace(".0", "")}%`;
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function labelSource(source: string) {
  if (source === "direct") return "Direto / sem campanha";
  return source.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function AcquisitionPage() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<AcquisitionPayload | null>(null);
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

  async function loadAcquisition() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/acquisition", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await response.json() as AcquisitionPayload | { error?: string };
      if (!response.ok || !("ok" in payload)) throw new Error((payload as { error?: string }).error ?? "Falha ao carregar aquisição");
      setData(payload as AcquisitionPayload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar aquisição");
    } finally {
      setBusy(false);
    }
  }

  return <main className={styles.page}><div className={styles.wrap}>
    <div className={styles.header}>
      <div>
        <h1 className={styles.title}>Central SMS — Aquisição</h1>
        <p className={styles.muted}>Veja de qual link cada pessoa chegou e acompanhe o funil das últimas 24 horas.</p>
      </div>
      <a className={styles.link} href="/admin/operations">← Voltar à operação</a>
    </div>

    <section className={styles.panel}>
      <div className={styles.toolbar}>
        <input className={styles.input} type="password" value={token} onChange={(event) => rememberToken(event.target.value)} placeholder="ADMIN_API_TOKEN" autoComplete="off" />
        <button className={styles.button} disabled={busy || !token} onClick={() => void loadAcquisition()}>{busy ? "Atualizando…" : "Atualizar aquisição"}</button>
      </div>
      {error && <div className={styles.error}>{error}</div>}
      {data && <div className={styles.statusRow} style={{ marginTop: 10 }}>
        <span className={styles.muted}>Atualizado em {dateTime(data.generatedAt)}</span>
        <span className={styles.muted}>Janela: últimas {data.windowHours}h</span>
      </div>}
    </section>

    {data && <>
      <div className={styles.cards}>
        <div className={styles.card}><div className={styles.cardLabel}>Chegaram ao bot</div><div className={styles.cardValue}>{data.totals.arrivals}</div><div className={styles.cardMeta}>Usuários únicos via /start</div></div>
        <div className={styles.card}><div className={styles.cardLabel}>Abriram a Mini App</div><div className={styles.cardValue}>{data.totals.appOpens}</div><div className={styles.cardMeta}>Conversão bot → app: {percent(data.totals.botToAppPercent)}</div></div>
        <div className={styles.card}><div className={styles.cardLabel}>Recarregaram via PIX</div><div className={styles.cardValue}>{data.totals.rechargers}</div><div className={styles.cardMeta}>{brl(data.totals.pixCents)} confirmado</div></div>
        <div className={styles.card}><div className={styles.cardLabel}>Compraram SMS</div><div className={styles.cardValue}>{data.totals.buyers}</div><div className={styles.cardMeta}>Conversão app → comprador: {percent(data.totals.appToBuyerPercent)}</div></div>
        <div className={styles.card}><div className={styles.cardLabel}>Receita atribuída</div><div className={styles.cardValue}>{brl(data.totals.revenueCents)}</div><div className={styles.cardMeta}>Ativações não reembolsadas da coorte</div></div>
      </div>

      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>Origem dos usuários — últimas 24h</h2>
        <p className={styles.muted}>A origem vem do parâmetro do seu link do Telegram, por exemplo <strong>?start=facebook</strong> ou <strong>?start=threads1</strong>. Atribuição por primeiro /start da janela.</p>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Origem</th><th>Chegaram</th><th>Abriram app</th><th>PIX</th><th>Compraram</th><th>Receita</th></tr></thead><tbody>
          {data.sources.map((row) => <tr key={row.source}>
            <td><strong>{labelSource(row.source)}</strong><div className={styles.cardMeta}>{row.source}</div></td>
            <td>{row.arrivals}</td>
            <td>{row.appOpens}</td>
            <td>{row.rechargers}<div className={styles.cardMeta}>{brl(row.pixCents)}</div></td>
            <td>{row.buyers}</td>
            <td>{brl(row.revenueCents)}</td>
          </tr>)}
          {!data.sources.length && <tr><td colSpan={6} className={styles.muted}>Ainda não há acessos rastreados nesta janela. A medição começa após a publicação desta versão.</td></tr>}
        </tbody></table></div>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>Como ler</h2>
        <p className={styles.muted}>“Chegaram” = abriram o bot pelo link e acionaram /start. “Abriram app” = entraram na Mini App. PIX e compras são atribuídos somente aos usuários dessa coorte, evitando misturar vendas antigas com campanhas novas.</p>
      </section>
    </>}
  </div></main>;
}
