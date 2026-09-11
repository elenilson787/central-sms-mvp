import { randomUUID } from "node:crypto";
import { env } from "@/src/config/env";
import { getSupabaseAdmin } from "@/src/db/supabase-server";
import { createPixPayment } from "@/src/payments/mercadopago";
import { consumeRateLimit } from "@/src/security/rate-limit";
import { validateTelegramMiniAppInitData } from "@/src/telegram/miniapp-auth";
import { getOrCreateMiniAppSession } from "@/src/telegram/miniapp-session";

function cleanDocument(value: string) {
  return value.replace(/\D/g, "");
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  if (!env.pixEnabled) return Response.json({ error: "PIX_DISABLED" }, { status: 503 });
  if (!env.mercadoPagoAccessToken || !env.mercadoPagoWebhookSecret) {
    return Response.json({ error: "PIX_GATEWAY_NOT_CONFIGURED" }, { status: 503 });
  }
  if (!env.telegramBotToken) return Response.json({ error: "TELEGRAM_BOT_TOKEN_NOT_CONFIGURED" }, { status: 503 });

  let body: {
    initData?: string;
    amountCents?: number;
    payerEmail?: string;
    documentType?: "CPF" | "CNPJ";
    documentNumber?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const amountCents = Number(body.amountCents);
  const payerEmail = String(body.payerEmail ?? "").trim().toLowerCase();
  const documentType = body.documentType;
  const documentNumber = cleanDocument(String(body.documentNumber ?? ""));
  const documentLengthOk = documentType === "CPF" ? documentNumber.length === 11 : documentType === "CNPJ" ? documentNumber.length === 14 : false;

  if (!Number.isInteger(amountCents) || amountCents < env.pixMinDepositCents || amountCents > env.pixMaxDepositCents) {
    return Response.json({ error: "PIX_AMOUNT_OUT_OF_RANGE", minCents: env.pixMinDepositCents, maxCents: env.pixMaxDepositCents }, { status: 400 });
  }
  if (!validEmail(payerEmail) || !documentType || !documentLengthOk) {
    return Response.json({ error: "INVALID_PAYER_DATA" }, { status: 400 });
  }

  try {
    const validated = await validateTelegramMiniAppInitData(body.initData ?? "", env.telegramBotToken, { maxAgeSeconds: 3600 });
    const session = await getOrCreateMiniAppSession(validated.user);
    const allowed = await consumeRateLimit({ scope: "miniapp-pix-create", key: validated.user.id, limit: 5, windowSeconds: 600 });
    if (!allowed) return Response.json({ error: "RATE_LIMITED" }, { status: 429 });

    const id = randomUUID();
    const externalReference = `wallet-deposit:${id}`;
    const supabase = getSupabaseAdmin();
    const preInsert = await supabase.from("payments").insert({
      id,
      user_id: session.user.id,
      provider: "mercado_pago",
      external_payment_id: `pending:${id}`,
      external_reference: externalReference,
      amount_cents: amountCents,
      status: "creating",
    });
    if (preInsert.error) throw preInsert.error;

    try {
      const payment = await createPixPayment({
        amountCents,
        description: "Recarga de saldo Central SMS",
        payerEmail,
        documentType,
        documentNumber,
        externalReference,
        idempotencyKey: id,
      });
      if (payment.id == null) throw new Error("MERCADO_PAGO_PAYMENT_ID_MISSING");

      const transactionData = payment.point_of_interaction?.transaction_data ?? {};
      const update = await supabase.from("payments").update({
        external_payment_id: String(payment.id),
        status: String(payment.status ?? "pending"),
        qr_code_text: transactionData.qr_code ?? null,
        qr_code_base64: transactionData.qr_code_base64 ?? null,
        ticket_url: transactionData.ticket_url ?? null,
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (update.error) throw update.error;

      return Response.json({
        ok: true,
        payment: {
          id,
          status: String(payment.status ?? "pending"),
          amountCents,
          qrCode: transactionData.qr_code ?? null,
          qrCodeBase64: transactionData.qr_code_base64 ?? null,
          ticketUrl: transactionData.ticket_url ?? null,
        },
      }, { status: 201 });
    } catch (error) {
      await supabase.from("payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", id);
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message.startsWith("TELEGRAM_INIT_DATA_")) return Response.json({ error: message }, { status: 401 });
    console.error("[miniapp-pix-create] failed", { message });
    return Response.json({ error: "PIX_CREATE_FAILED" }, { status: 502 });
  }
}
