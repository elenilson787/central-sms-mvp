import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/src/config/env";

type PixInput = {
  amountCents: number;
  description: string;
  payerEmail: string;
  documentType: "CPF" | "CNPJ";
  documentNumber: string;
  externalReference: string;
  idempotencyKey: string;
};

type MercadoPagoPayment = {
  id?: string | number;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  currency_id?: string;
  payment_method_id?: string;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
};

const API_BASE = "https://api.mercadopago.com";

function requireAccessToken() {
  if (!env.mercadoPagoAccessToken) throw new Error("MERCADO_PAGO_ACCESS_TOKEN_NOT_CONFIGURED");
  return env.mercadoPagoAccessToken;
}

async function parseResponse(response: Response): Promise<Record<string, any>> {
  const payload = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok) {
    const code = payload?.cause?.[0]?.code ?? payload?.error ?? response.status;
    const message = payload?.message ?? payload?.error ?? "Mercado Pago request failed";
    throw new Error(`MERCADO_PAGO_API_ERROR:${code}:${String(message)}`);
  }
  return payload;
}

export async function createPixPayment(input: PixInput): Promise<MercadoPagoPayment> {
  const token = requireAccessToken();
  const response = await fetch(`${API_BASE}/v1/payments`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json",
      "x-idempotency-key": input.idempotencyKey,
    },
    body: JSON.stringify({
      transaction_amount: input.amountCents / 100,
      description: input.description,
      payment_method_id: "pix",
      external_reference: input.externalReference,
      payer: {
        email: input.payerEmail,
        identification: {
          type: input.documentType,
          number: input.documentNumber,
        },
      },
    }),
  });
  return await parseResponse(response) as MercadoPagoPayment;
}

export async function getPayment(paymentId: string): Promise<MercadoPagoPayment> {
  const token = requireAccessToken();
  const response = await fetch(`${API_BASE}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
    },
  });
  return await parseResponse(response) as MercadoPagoPayment;
}

function parseSignature(header: string) {
  const values = new Map<string, string>();
  for (const pair of header.split(",")) {
    const [rawKey, ...rest] = pair.trim().split("=");
    if (rawKey && rest.length) values.set(rawKey, rest.join("="));
  }
  return { ts: values.get("ts"), v1: values.get("v1") };
}

export function verifyMercadoPagoWebhookSignature(input: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
}): boolean {
  const secret = env.mercadoPagoWebhookSecret;
  if (!secret || !input.xSignature) return false;

  const { ts, v1 } = parseSignature(input.xSignature);
  if (!ts || !v1) return false;

  const parts: string[] = [];
  if (input.dataId) parts.push(`id:${input.dataId};`);
  if (input.xRequestId) parts.push(`request-id:${input.xRequestId};`);
  parts.push(`ts:${ts};`);
  const manifest = parts.join("");
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");

  try {
    const expectedBuffer = Buffer.from(expected, "hex");
    const receivedBuffer = Buffer.from(v1, "hex");
    return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch {
    return false;
  }
}

export function paymentAmountCents(payment: MercadoPagoPayment) {
  return Math.round(Number(payment.transaction_amount ?? 0) * 100);
}

export type { MercadoPagoPayment };
