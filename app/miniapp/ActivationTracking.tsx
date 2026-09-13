"use client";

import { useState } from "react";
import styles from "./activation-tracking.module.css";

export type ActivationTrackingItem = {
  id: string;
  kind: "ONE_TIME_SMS" | "TEMPORARY_HOSTING";
  country: string;
  product: string;
  phone?: string;
  status: string;
  salePriceCents: number;
  createdAt: string;
  updatedAt?: string;
  expiresAt?: string;
  smsCode?: string;
  smsText?: string;
};

type Props = {
  activations: ActivationTrackingItem[];
  currency: string;
  autoRefreshActive: boolean;
  refreshing: boolean;
  onRefresh: () => void;
};

const TRACKING_STEPS = ["Pedido", "Número", "Aguardando SMS", "SMS recebido"];
const LIVE_STATUSES = new Set(["creating", "number_received", "waiting_sms"]);

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    creating: "Criando pedido",
    number_received: "Número recebido",
    waiting_sms: "Aguardando SMS",
    sms_received: "SMS recebido",
    completed: "Concluída",
    cancelled: "Cancelada",
    expired: "Expirada",
    refunded: "Reembolsada",
    failed: "Falhou",
  };
  return labels[status] ?? status;
}

function stepIndex(status: string) {
  if (status === "creating") return 0;
  if (status === "number_received") return 1;
  if (status === "waiting_sms") return 2;
  if (status === "sms_received" || status === "completed") return 3;
  return -1;
}

function isFailureStatus(status: string) {
  return ["cancelled", "expired", "refunded", "failed"].includes(status);
}

function kindLabel(kind: ActivationTrackingItem["kind"]) {
  return kind === "TEMPORARY_HOSTING" ? "Aluguel longo" : "Ativação única";
}

export default function ActivationTracking({ activations, currency, autoRefreshActive, refreshing, onRefresh }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copyValue(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
      window.setTimeout(() => setCopied((current) => current === key ? null : current), 1800);
    } catch {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
    }
  }

  if (!activations.length) {
    return <div className={styles.empty}>
      <strong>Nenhuma ativação ainda</strong>
      <span>Quando uma compra for liberada e concluída, o número e o SMS aparecerão aqui.</span>
    </div>;
  }

  return <div className={styles.wrapper}>
    <div className={styles.liveBar}>
      <div>
        <strong>{autoRefreshActive ? "Acompanhamento ao vivo ativado" : "Histórico de ativações"}</strong>
        <span>{autoRefreshActive ? "Atualizamos automaticamente a cada 10 segundos enquanto houver SMS pendente." : "Use atualizar para conferir qualquer mudança recente."}</span>
      </div>
      <button type="button" className={styles.refreshButton} onClick={onRefresh} disabled={refreshing}>
        {refreshing ? "Atualizando…" : "Atualizar"}
      </button>
    </div>

    <div className={styles.list}>
      {activations.map((activation) => {
        const currentStep = stepIndex(activation.status);
        const live = LIVE_STATUSES.has(activation.status);
        const failed = isFailureStatus(activation.status);
        const code = activation.smsCode?.trim();
        const smsText = activation.smsText?.trim();

        return <article className={styles.card} key={activation.id}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.kind}>{kindLabel(activation.kind)}</span>
              <h3>Número para {activation.product}</h3>
              <p>{activation.country}</p>
            </div>
            <span className={`${styles.statusPill} ${failed ? styles.statusFailed : live ? styles.statusLive : styles.statusDone}`}>
              {live && <span className={styles.pulse} aria-hidden="true" />}
              {statusLabel(activation.status)}
            </span>
          </div>

          {!failed && <div className={styles.timeline} aria-label={`Andamento: ${statusLabel(activation.status)}`}>
            {TRACKING_STEPS.map((step, index) => {
              const done = currentStep > index;
              const current = currentStep === index;
              return <div className={`${styles.step} ${done ? styles.stepDone : ""} ${current ? styles.stepCurrent : ""}`} key={step}>
                <span className={styles.stepDot}>{done ? "✓" : index + 1}</span>
                <span>{step}</span>
              </div>;
            })}
          </div>}

          {failed && <div className={styles.failureNotice}>
            Esta ativação foi encerrada com status <strong>{statusLabel(activation.status)}</strong>. Nenhuma nova atualização de SMS é esperada para ela.
          </div>}

          <div className={styles.dataGrid}>
            <div className={styles.dataBox}>
              <span>Número</span>
              <strong>{activation.phone || "Aguardando atribuição"}</strong>
              {activation.phone && <button type="button" onClick={() => void copyValue(`${activation.id}:phone`, activation.phone!)}>
                {copied === `${activation.id}:phone` ? "Copiado ✓" : "Copiar número"}
              </button>}
            </div>

            <div className={`${styles.dataBox} ${code ? styles.codeBox : ""}`}>
              <span>Código SMS</span>
              <strong className={code ? styles.code : undefined}>{code || (live ? "Aguardando SMS…" : "—")}</strong>
              {code && <button type="button" onClick={() => void copyValue(`${activation.id}:code`, code)}>
                {copied === `${activation.id}:code` ? "Copiado ✓" : "Copiar código"}
              </button>}
            </div>
          </div>

          {smsText && <div className={styles.smsMessage}>
            <span>Mensagem recebida</span>
            <p>{smsText}</p>
          </div>}

          {live && <div className={styles.waitingNotice}>
            {activation.status === "creating" && "Pedido criado. Estamos aguardando a confirmação do número pelo fornecedor."}
            {activation.status === "number_received" && "Número recebido. Preparando o acompanhamento do SMS."}
            {activation.status === "waiting_sms" && "Número ativo. Assim que o SMS chegar ao fornecedor, o código aparecerá aqui."}
          </div>}

          <div className={styles.meta}>
            <span>{formatMoney(activation.salePriceCents, currency)}</span>
            <span>Criada em {formatDate(activation.createdAt)}</span>
            {activation.updatedAt && <span>Atualizada em {formatDate(activation.updatedAt)}</span>}
            {activation.expiresAt && <span>Expira em {formatDate(activation.expiresAt)}</span>}
          </div>
        </article>;
      })}
    </div>
  </div>;
}
