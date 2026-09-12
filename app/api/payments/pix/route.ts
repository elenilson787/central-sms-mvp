import { randomUUID } from "node:crypto";
import { env } from "@/src/config/env";
import { getSupabaseAdmin } from "@/src/db/supabase-server";
import { createPixOrder, normalizeOrderStatus, orderPixData } from "@/src/payments/mercadopago";

export async function POST(request: Request) {
  if (!env.adminApiToken || request.headers.get("authorization") !== `Bearer ${env.adminApiToken}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!env.pixEnabled) return Response.json({ error: "PIX_DISABLED" }, { status: 503 });
  if (!env.mercadoPagoAccessToken || !env.mercadoPagoWebhookSecret) {
    return Response.json({ error: "PIX_GATEWAY_NOT_CONFIGURED" }, { status: 503 });
  }

  const body = await request.json() as { userId?: string; amountCents?: number; payerEmail?: string; documentType?: "CPF" | "CNPJ"; documentNumber?: string };
  if (!body.userId || !Number.isInteger(body.amountCents) || (body.amountCents ?? 0) < env.pixMinDepositCents || !body.payerEmail || !body.documentType || !body.documentNumber) {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }

  const id = randomUUID();
  const externalReference = `wallet-deposit:${id}`;
  const order = await createPixOrder({
    amountCents: body.amountCents!,
    description: "Recarga de saldo Central SMS",
    payerEmail: body.payerEmail,
    documentType: body.documentType,
    documentNumber: body.documentNumber.replace(/\D/g, ""),
    externalReference,
    idempotencyKey: id,
  });
  if (!order.id) return Response.json({ error: "order_id_missing" }, { status: 502 });

  const pix = orderPixData(order);
  const status = normalizeOrderStatus(order);
  const supabase = getSupabaseAdmin();
  const insert = await supabase.from("payments").insert({
    id,
    user_id: body.userId,
    provider: "mercado_pago_orders",
    external_payment_id: String(order.id),
    external_reference: externalReference,
    amount_cents: body.amountCents,
    status,
    qr_code_text: pix.qrCode,
    qr_code_base64: pix.qrCodeBase64,
    ticket_url: pix.ticketUrl,
  });
  if (insert.error) throw insert.error;

  return Response.json({ id, status, qrCode: pix.qrCode, qrCodeBase64: pix.qrCodeBase64, ticketUrl: pix.ticketUrl });
}
