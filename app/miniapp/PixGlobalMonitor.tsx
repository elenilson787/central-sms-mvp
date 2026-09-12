"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./pix-global-monitor.module.css";

type PixPayment = {
  id: string;
  status: string;
  amountCents: number;
};

type Props = {
  active: boolean;
  onBalanceUpdated: () => Promise<void> | void;
  onOpenPix: () => void;
};

type Phase = "idle" | "waiting" | "confirmed" | "paused";

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function nextDelay(elapsedMs: number) {
  if (elapsedMs < 60_000) return 4_000;
  if (elapsedMs < 180_000) return 10_000;
  if (elapsedMs < 300_000) return 20_000;
  return null;
}

function isTerminal(status: string) {
  return status === "approved" || status === "rejected" || status === "cancelled";
}

export default function PixGlobalMonitor({ active, onBalanceUpdated, onOpenPix }: Props) {
  const [payment, setPayment] = useState<PixPayment | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const runRef = useRef(0);

  useEffect(() => {
    if (!active) {
      runRef.current += 1;
      setPayment(null);
      setPhase("idle");
      return;
    }

    const runId = ++runRef.current;
    const startedAt = Date.now();
    let timer: number | undefined;

    const stillCurrent = () => runRef.current === runId;

    const finishApproved = async (current: PixPayment) => {
      if (!stillCurrent()) return;
      setPayment({ ...current, status: "approved" });
      setPhase("confirmed");
      await onBalanceUpdated();
      if (!stillCurrent()) return;
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
      timer = window.setTimeout(() => {
        if (!stillCurrent()) return;
        setPayment(null);
        setPhase("idle");
      }, 2200);
    };

    const pollStatus = async (current: PixPayment) => {
      if (!stillCurrent()) return;
      const initData = window.Telegram?.WebApp?.initData;
      if (!initData) return;

      try {
        const response = await fetch("/api/telegram/miniapp/pix/status", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ initData, paymentId: current.id }),
        });
        const payload = await response.json() as { status?: string; credited?: boolean };
        if (!stillCurrent() || !response.ok || !payload.status) return;

        const updated = { ...current, status: payload.status };
        setPayment(updated);

        if (payload.credited || payload.status === "approved") {
          await finishApproved(updated);
          return;
        }

        if (isTerminal(payload.status)) {
          setPhase("idle");
          setPayment(null);
          await onBalanceUpdated();
          return;
        }
      } catch {
        // The monitor is a UX fallback. Webhooks remain the primary confirmation path.
      }

      if (!stillCurrent()) return;
      const delay = nextDelay(Date.now() - startedAt);
      if (delay === null) {
        setPhase("paused");
        return;
      }
      timer = window.setTimeout(() => void pollStatus(current), delay);
    };

    const resumeLatest = async () => {
      const initData = window.Telegram?.WebApp?.initData;
      if (!initData) return;

      try {
        const response = await fetch("/api/telegram/miniapp/pix/latest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ initData }),
        });
        const payload = await response.json() as { payment?: PixPayment | null };
        if (!stillCurrent() || !response.ok) return;

        if (!payload.payment) {
          // A webhook may have completed the payment before this monitor started.
          await onBalanceUpdated();
          return;
        }

        setPayment(payload.payment);
        if (payload.payment.status === "approved") {
          await finishApproved(payload.payment);
          return;
        }
        if (isTerminal(payload.payment.status)) return;

        setPhase("waiting");
        const delay = nextDelay(0) ?? 4_000;
        timer = window.setTimeout(() => void pollStatus(payload.payment!), delay);
      } catch {
        // Do not block the Mini App if payment recovery is temporarily unavailable.
      }
    };

    void resumeLatest();

    return () => {
      runRef.current += 1;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [active, onBalanceUpdated]);

  if (!active || phase === "idle") return null;

  if (phase === "confirmed") {
    return (
      <div className={`${styles.banner} ${styles.success}`} role="status" aria-live="polite">
        <span className={styles.icon}>✓</span>
        <div>
          <strong>Pagamento confirmado</strong>
          <span>{payment ? `${money(payment.amountCents)} foi adicionado à sua carteira.` : "Seu saldo foi atualizado."}</span>
        </div>
      </div>
    );
  }

  return (
    <button className={styles.banner} type="button" onClick={onOpenPix} aria-live="polite">
      <span className={phase === "waiting" ? styles.spinner : styles.icon}>{phase === "paused" ? "!" : ""}</span>
      <div>
        <strong>{phase === "waiting" ? "Confirmando pagamento, aguarde…" : "Pagamento ainda pendente"}</strong>
        <span>
          {phase === "waiting"
            ? `${payment ? money(payment.amountCents) : "PIX"} · você pode continuar usando a Central SMS.`
            : "A verificação automática foi pausada. Toque para abrir a recarga e verificar novamente."}
        </span>
      </div>
    </button>
  );
}
