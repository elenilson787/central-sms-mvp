import { randomUUID } from "node:crypto";
import { env } from "@/src/config/env";
import { getSupabaseAdmin } from "@/src/db/supabase-server";
import { createPixPayment } from "@/src/payments/mercadopago";

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
  const payment = await createPixPayment({
    amountCents: body.amountCents!,
    description: "Recarga de saldo Central SMS",
    payerEmail: body.payerEmail,
    documentType: body.documentType,
    documentNumber: body.documentNumber.replace(/\D/g, ""),
    externalReference,
    idempotencyKey: id,
  });
  if (payment.id == null) return Response.json({ error: "payment_id_missing" }, { status: 502 });

  const transactionData = payment.point_of_interaction?.transaction_data ?? {};
  const supabase = getSupabaseAdmin();
  const insert = await supabase.from("payments").insert({
    id,
    user_id: body.userId,
    provider: "mercado_pago",
    external_payment_id: String(payment.id),
    external_reference: externalReference,
    amount_cents: body.amountCents,
    status: String(payment.status ?? "pending"),
    qr_code_text: transactionData.qr_code ?? null,
    qr_code_base64: transactionData.qr_code_base64 ?? null,
    ticket_url: transactionData.ticket_url ?? null,
  });
  if (insert.error) throw insert.error;

  return Response.json({ id, status: payment.status, qrCode: transactionData.qr_code, qrCodeBase64: transactionData.qr_code_base64, ticketUrl: transactionData.ticket_url });
}
