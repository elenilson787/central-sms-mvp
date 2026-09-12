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

type MercadoPagoOrderPayment = {
  id?: string;
  status?: string;
  status_detail?: string;
  amount?: string | number;
  paid_amount?: string | number;
  payment_method?: {
    id?: string;
    type?: string;
    ticket_url?: string;
    qr_code?: string;
    qr_code_base64?: string;
  };
};

export type MercadoPagoOrder = {
  id?: string;
  type?: string;
  processing_mode?: string;
  external_reference?: string;
  total_amount?: string | number;
  total_paid_amount?: string | number;
  country_code?: string;
  status?: string;
  status_detail?: string;
  transactions?: {
    payments?: MercadoPagoOrderPayment[];
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
    const firstError = Array.isArray(payload?.errors) ? payload.errors[0] : undefined;
    const code = firstError?.code ?? payload?.cause?.[0]?.code ?? payload?.error ?? response.status;
    const message = firstError?.message ?? payload?.message ?? payload?.error ?? "Mercado Pago request failed";
    throw new Error(`MERCADO_PAGO_API_ERROR:${String(code)}:${String(message)}`);
  }
  return payload;
}

export async function createPixOrder(input: PixInput): Promise<MercadoPagoOrder> {
  const token = requireAccessToken();
  const amount = (input.amountCents / 100).toFixed(2);
  const payer = env.mercadoPagoTestMode
    ? {
        email: "test_user_br@testuser.com",
        first_name: "APRO",
      }
    : {
        email: input.payerEmail,
        identification: {
          type: input.documentType,
          number: input.documentNumber,
        },
      };

  const response = await fetch(`${API_BASE}/v1/orders`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json",
      "x-idempotency-key": input.idempotencyKey,
    },
    body: JSON.stringify({
      type: "online",
      total_amount: amount,
      external_reference: input.externalReference,
      processing_mode: "automatic",
      description: input.description,
      transactions: {
        payments: [
          {
            amount,
            payment_method: {
              id: "pix",
              type: "bank_transfer",
            },
            expiration_time: "PT24H",
          },
        ],
      },
      payer,
    }),
  });
  return await parseResponse(response) as MercadoPagoOrder;
}

export async function getOrder(orderId: string): Promise<MercadoPagoOrder> {
  const token = requireAccessToken();
  const response = await fetch(`${API_BASE}/v1/orders/${encodeURIComponent(orderId)}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
    },
  });
  return await parseResponse(response) as MercadoPagoOrder;
}

export function primaryOrderPayment(order: MercadoPagoOrder): MercadoPagoOrderPayment | undefined {
  return order.transactions?.payments?.[0];
}

export function orderPixData(order: MercadoPagoOrder) {
  const paymentMethod = primaryOrderPayment(order)?.payment_method;
  return {
    qrCode: paymentMethod?.qr_code ?? null,
    qrCodeBase64: paymentMethod?.qr_code_base64 ?? null,
    ticketUrl: paymentMethod?.ticket_url ?? null,
  };
}

export function orderAmountCents(order: MercadoPagoOrder) {
  return Math.round(Number(order.total_amount ?? 0) * 100);
}

export function orderIsAccredited(order: MercadoPagoOrder) {
  const payment = primaryOrderPayment(order);
  return order.status === "processed" &&
    order.status_detail === "accredited" &&
    payment?.status === "processed" &&
    payment?.status_detail === "accredited";
}

export function normalizeOrderStatus(order: MercadoPagoOrder) {
  if (orderIsAccredited(order)) return "approved";
  if (order.status === "action_required" || order.status === "created") return "pending";
  if (order.status === "processing") return "in_process";
  if (order.status === "cancelled" || order.status === "canceled" || order.status === "expired") return "cancelled";
  if (order.status === "failed" || order.status === "rejected") return "rejected";
  return String(order.status ?? "pending");
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
  const expected = createHmac("sha256", secret).update(parts.join("")).digest("hex");

  try {
    const expectedBuffer = Buffer.from(expected, "hex");
    const receivedBuffer = Buffer.from(v1, "hex");
    return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch {
    return false;
  }
}
