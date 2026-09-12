"use client";

import { useState } from "react";
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
    pending: "Aguardando pagamento",
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
  };
  return messages[code ?? ""] ?? code ?? "Não foi possível concluir a operação.";
}

export default function PixRechargePanel({ onBalanceUpdated }: Props) {
  const [amountReais, setAmountReais] = useState("10,00");
  const [email, setEmail] = useState("");
  const [documentType, setDocumentType] = useState<"CPF" | "CNPJ">("CPF");
  const [documentNumber, setDocumentNumber] = useState("");
  const [payment, setPayment] = useState<PixPayment | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function amountCents() {
    const normalized = amountReais.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    const value = Number(normalized);
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
  }

  async function createPayment() {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return;
    setLoading(true);
    setError(null);
    setCopied(false);
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
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : userFriendlyError("PIX_CREATE_FAILED");
      setError(message);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
    } finally {
      setLoading(false);
    }
  }

  async function checkPayment() {
    if (!payment) return;
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return;
    setChecking(true);
    setError(null);
    try {
      const response = await fetch("/api/telegram/miniapp/pix/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData, paymentId: payment.id }),
      });
      const payload = await response.json() as { status?: string; credited?: boolean; error?: string };
      if (!response.ok || !payload.status) throw new Error(payload.error ?? "PIX_STATUS_FAILED");
      setPayment((current) => current ? { ...current, status: payload.status! } : current);
      if (payload.credited || payload.status === "approved") {
        await onBalanceUpdated();
        window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
      }
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "PIX_STATUS_FAILED";
      setError(userFriendlyError(code));
    } finally {
      setChecking(false);
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

  if (payment) {
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

        {payment.status === "approved" ? (
          <div className={styles.success}>Pagamento confirmado. O saldo da carteira já foi atualizado.</div>
        ) : (
          <button className={styles.secondary} type="button" onClick={() => void checkPayment()} disabled={checking}>
            {checking ? "Verificando…" : "Já paguei — verificar"}
          </button>
        )}

        {payment.ticketUrl && payment.status !== "approved" && (
          <a className={styles.link} href={payment.ticketUrl} target="_blank" rel="noreferrer">Abrir cobrança PIX</a>
        )}
        {error && <div className={styles.error}>{error}</div>}
        <button className={styles.textButton} type="button" onClick={() => { setPayment(null); setError(null); }}>Gerar outra cobrança</button>
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
