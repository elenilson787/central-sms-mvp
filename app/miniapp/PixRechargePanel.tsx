"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./pix-recharge.module.css";

type PixPayment = {
  id: string;
  status: string;
  amountCents: number;
  qrCode?: string | null;
  qrCodeBase64?: string | null;
  ticketUrl?: string | null;
};

type Props = {
  onBalanceUpdated: () => Promise<void> | void;
};

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Aguardando confirmação",
    approved: "Pagamento aprovado",
    rejected: "Pagamento rejeitado",
    cancelled: "Pagamento cancelado",
    in_process: "Pagamento em análise",
    creating: "Criando cobrança",
  };
  return labels[status] ?? status;
}

function userFriendlyError(code?: string) {
  const messages: Record<string, string> = {
    PIX_DISABLED: "O PIX ainda não foi habilitado pelo administrador.",
    PIX_GATEWAY_NOT_CONFIGURED: "As credenciais do Mercado Pago ainda não foram configuradas.",
    PIX_AMOUNT_OUT_OF_RANGE: "O valor da recarga está fora dos limites permitidos.",
    PIX_TEST_AMOUNT_REQUIRED: "No modo de teste do Mercado Pago, use exatamente R$ 50,00.",
    INVALID_PAYER_DATA: "Confira o e-mail e o CPF/CNPJ informado.",
    RATE_LIMITED: "Muitas tentativas em pouco tempo. Aguarde alguns minutos.",
    PIX_CREATE_FAILED: "Não foi possível gerar a cobrança PIX agora.",
    PIX_STATUS_FAILED: "Não foi possível consultar o pagamento agora.",
    PIX_LATEST_FAILED: "Não foi possível recuperar a cobrança pendente agora.",
  };
  return messages[code ?? ""] ?? code ?? "Não foi possível concluir a operação.";
}

function isTerminal(status: string) {
  return status === "approved" || status === "rejected" || status === "cancelled";
}

export default function PixRechargePanel({ onBalanceUpdated }: Props) {
  const [amountReais, setAmountReais] = useState("10,00");
  const [email, setEmail] = useState("");
  const [documentType, setDocumentType] = useState<"CPF" | "CNPJ">("CPF");
  const [documentNumber, setDocumentNumber] = useState("");
  const [payment, setPayment] = useState<PixPayment | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [resuming, setResuming] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const checkingRef = useRef(false);
  const completionHandledRef = useRef(false);
  const resumeStartedRef = useRef(false);

  function amountCents() {
    const normalized = amountReais.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    const value = Number(normalized);
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
  }

  const finishApprovedPayment = useCallback(async () => {
    if (completionHandledRef.current) return;
    completionHandledRef.current = true;
    setPayment((current) => current ? { ...current, status: "approved" } : current);
    setError(null);
    try {
      await onBalanceUpdated();
    } finally {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
      window.setTimeout(() => {
        window.location.assign("/miniapp");
      }, 1200);
    }
  }, [onBalanceUpdated]);

  const checkPayment = useCallback(async (paymentId: string, silent = false) => {
    if (checkingRef.current) return;
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return;

    checkingRef.current = true;
    if (!silent) setChecking(true);
    if (!silent) setError(null);

    try {
      const response = await fetch("/api/telegram/miniapp/pix/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData, paymentId }),
      });
      const payload = await response.json() as { status?: string; credited?: boolean; error?: string };
      if (!response.ok || !payload.status) throw new Error(payload.error ?? "PIX_STATUS_FAILED");

      setPayment((current) => current && current.id === paymentId ? { ...current, status: payload.status! } : current);
      if (payload.credited || payload.status === "approved") {
        await finishApprovedPayment();
      }
    } catch (cause) {
      if (!silent) {
        const code = cause instanceof Error ? cause.message : "PIX_STATUS_FAILED";
        setError(userFriendlyError(code));
      }
    } finally {
      checkingRef.current = false;
      if (!silent) setChecking(false);
    }
  }, [finishApprovedPayment]);

  useEffect(() => {
    if (resumeStartedRef.current) return;
    resumeStartedRef.current = true;

    const resumeLatestPayment = async () => {
      const initData = window.Telegram?.WebApp?.initData;
      if (!initData) { setResuming(false); return; }
      try {
        const response = await fetch("/api/telegram/miniapp/pix/latest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ initData }),
        });
        const payload = await response.json() as { payment?: PixPayment | null; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "PIX_LATEST_FAILED");
        if (payload.payment) {
          setPayment(payload.payment);
          if (payload.payment.status === "approved") await finishApprovedPayment();
        }
      } catch {
        // A falha ao retomar uma cobrança anterior não impede criar uma nova.
      } finally {
        setResuming(false);
      }
    };

    void resumeLatestPayment();
  }, [finishApprovedPayment]);

  useEffect(() => {
    if (!payment || isTerminal(payment.status)) return;
    void checkPayment(payment.id, true);
    const timer = window.setInterval(() => void checkPayment(payment.id, true), 3500);
    return () => window.clearInterval(timer);
  }, [payment?.id, payment?.status, checkPayment]);

  async function createPayment() {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return;
    setLoading(true);
    setError(null);
    setCopied(false);
    completionHandledRef.current = false;
    try {
      const response = await fetch("/api/telegram/miniapp/pix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          initData,
          amountCents: amountCents(),
          payerEmail: email,
          documentType,
          documentNumber,
        }),
      });
      const payload = await response.json() as { payment?: PixPayment; error?: string; detail?: string };
      if (!response.ok || !payload.payment) {
        const friendly = userFriendlyError(payload.error ?? "PIX_CREATE_FAILED");
        throw new Error(payload.detail ? `${friendly}\n${payload.detail}` : friendly);
      }
      setPayment(payload.payment);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
      if (payload.payment.status === "approved") await finishApprovedPayment();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : userFriendlyError("PIX_CREATE_FAILED");
      setError(message);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
    } finally {
      setLoading(false);
    }
  }

  async function copyPix() {
    if (!payment?.qrCode) return;
    try {
      await navigator.clipboard.writeText(payment.qrCode);
      setCopied(true);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
    } catch {
      setError("Não foi possível copiar automaticamente. Selecione o código manualmente.");
    }
  }

  function resetPayment() {
    completionHandledRef.current = false;
    setPayment(null);
    setError(null);
    setCopied(false);
  }

  if (resuming && !payment) {
    return (
      <section className={styles.panel}>
        <div className={styles.confirming}>
          <span className={styles.spinner} aria-hidden="true" />
          <div><strong>Verificando cobranças pendentes…</strong><span>Aguarde um instante.</span></div>
        </div>
      </section>
    );
  }

  if (payment) {
    const waiting = !isTerminal(payment.status);
    return (
      <section className={styles.panel}>
        <div className={styles.statusCard}>
          <span className={styles.statusLabel}>{statusLabel(payment.status)}</span>
          <strong>{money(payment.amountCents)}</strong>
        </div>

        {payment.qrCodeBase64 && payment.status !== "approved" && (
          <div className={styles.qrWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.qr} src={`data:image/png;base64,${payment.qrCodeBase64}`} alt="QR Code PIX" />
          </div>
        )}

        {payment.qrCode && payment.status !== "approved" && (
          <>
            <label className={styles.label}>PIX Copia e Cola</label>
            <textarea className={styles.code} readOnly value={payment.qrCode} rows={4} />
            <button className={styles.primary} type="button" onClick={() => void copyPix()}>{copied ? "Copiado ✓" : "Copiar código PIX"}</button>
          </>
        )}

        {waiting && (
          <div className={styles.confirming} aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            <div>
              <strong>Confirmando pagamento, aguarde…</strong>
              <span>Assim que o Mercado Pago confirmar, o saldo será atualizado e você voltará automaticamente para a tela inicial.</span>
            </div>
          </div>
        )}

        {payment.status === "approved" && (
          <div className={styles.success} aria-live="polite">Pagamento confirmado! Atualizando seu saldo e voltando para a tela inicial…</div>
        )}

        {payment.status === "rejected" && <div className={styles.error}>O pagamento foi rejeitado. Gere uma nova cobrança para tentar novamente.</div>}
        {payment.status === "cancelled" && <div className={styles.error}>A cobrança foi cancelada ou expirou.</div>}

        {waiting && (
          <button className={styles.secondary} type="button" onClick={() => void checkPayment(payment.id, false)} disabled={checking}>
            {checking ? "Verificando…" : "Verificar agora"}
          </button>
        )}

        {payment.ticketUrl && waiting && (
          <a className={styles.link} href={payment.ticketUrl} target="_blank" rel="noreferrer">Abrir cobrança PIX</a>
        )}
        {error && <div className={styles.error}>{error}</div>}
        {(payment.status === "rejected" || payment.status === "cancelled") && (
          <button className={styles.textButton} type="button" onClick={resetPayment}>Gerar outra cobrança</button>
        )}
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <div className={styles.intro}>
        <strong>Adicionar saldo via PIX</strong>
        <span>O saldo só é creditado após confirmação do Mercado Pago.</span>
      </div>

      <div className={styles.quickValues}>
        {[1000, 2000, 5000, 10000].map((cents) => (
          <button key={cents} type="button" onClick={() => setAmountReais((cents / 100).toFixed(2).replace(".", ","))}>{money(cents)}</button>
        ))}
      </div>

      <label className={styles.label}>Valor da recarga</label>
      <div className={styles.moneyInput}><span>R$</span><input inputMode="decimal" value={amountReais} onChange={(event) => setAmountReais(event.target.value)} /></div>

      <label className={styles.label}>E-mail do pagador</label>
      <input className={styles.input} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" />

      <div className={styles.documentRow}>
        <div>
          <label className={styles.label}>Documento</label>
          <select className={styles.input} value={documentType} onChange={(event) => setDocumentType(event.target.value as "CPF" | "CNPJ")}>
            <option value="CPF">CPF</option>
            <option value="CNPJ">CNPJ</option>
          </select>
        </div>
        <div>
          <label className={styles.label}>Número</label>
          <input className={styles.input} inputMode="numeric" value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} placeholder={documentType === "CPF" ? "000.000.000-00" : "00.000.000/0000-00"} />
        </div>
      </div>

      <p className={styles.privacy}>E-mail e CPF/CNPJ são enviados ao Mercado Pago para criar a cobrança e não são armazenados pela Central SMS.</p>
      {error && <div className={styles.error}>{error}</div>}
      <button className={styles.primary} type="button" onClick={() => void createPayment()} disabled={loading}>
        {loading ? "Gerando PIX…" : `Gerar PIX de ${money(amountCents())}`}
      </button>
    </section>
  );
}
