"use client";

import { useEffect, useState } from "react";
import styles from "./pix-payment-history.module.css";

type PaymentHistoryItem = {
  id: string;
  status: string;
  amountCents: number;
  createdAt: string;
  paidAt?: string | null;
};

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function dateTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    creating: "Criando",
    pending: "Aguardando pagamento",
    in_process: "Em análise",
    approved: "Pago",
    rejected: "Rejeitado",
    cancelled: "Cancelado",
    failed: "Falhou",
    integrity_mismatch: "Revisão necessária",
  };
  return labels[status] ?? status;
}

function statusClass(status: string) {
  if (status === "approved") return styles.approved;
  if (status === "rejected" || status === "cancelled" || status === "failed" || status === "integrity_mismatch") return styles.failed;
  return styles.pending;
}

export default function PixPaymentHistory({ refreshKey = 0 }: { refreshKey?: number }) {
  const [items, setItems] = useState<PaymentHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const initData = window.Telegram?.WebApp?.initData;
      if (!initData) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(false);
      try {
        const response = await fetch("/api/telegram/miniapp/pix/history", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ initData }),
        });
        const payload = await response.json() as { payments?: PaymentHistoryItem[] };
        if (!response.ok || !payload.payments) throw new Error("PIX_HISTORY_FAILED");
        if (!cancelled) setItems(payload.payments);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [refreshKey]);

  return (
    <section className={styles.section} aria-label="Recargas PIX recentes">
      <div className={styles.header}>
        <div>
          <h2>Recargas recentes</h2>
          <p>Últimas cobranças PIX desta conta.</p>
        </div>
        <span>{items.length}/8</span>
      </div>

      {loading && <div className={styles.empty}>Carregando histórico…</div>}
      {!loading && error && <div className={styles.empty}>Não foi possível carregar o histórico agora.</div>}
      {!loading && !error && !items.length && <div className={styles.empty}>Nenhuma recarga PIX registrada ainda.</div>}

      {!loading && !error && items.length > 0 && (
        <div className={styles.list}>
          {items.map((item) => (
            <article className={styles.item} key={item.id}>
              <div>
                <strong>{money(item.amountCents)}</strong>
                <span>{item.paidAt ? `Confirmado em ${dateTime(item.paidAt)}` : `Criado em ${dateTime(item.createdAt)}`}</span>
              </div>
              <span className={`${styles.status} ${statusClass(item.status)}`}>{statusLabel(item.status)}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
