import { env } from "@/src/config/env";
import { getSupabaseAdmin } from "@/src/db/supabase-server";
import { currentPaymentEnvironment } from "@/src/payments/environment";
import { reconcileMercadoPagoOrder } from "@/src/payments/reconcile";
import { validateTelegramMiniAppInitData } from "@/src/telegram/miniapp-auth";
import { getOrCreateMiniAppSession } from "@/src/telegram/miniapp-session";

type LocalPayment = {
  id: string;
  external_payment_id: string;
  status: string;
  amount_cents: number;
  qr_code_text?: string | null;
  qr_code_base64?: string | null;
  ticket_url?: string | null;
};

function toClientPayment(payment: LocalPayment) {
  return {
    id: payment.id,
    status: payment.status,
    amountCents: Number(payment.amount_cents),
    qrCode: payment.qr_code_text ?? null,
    qrCodeBase64: payment.qr_code_base64 ?? null,
    ticketUrl: payment.ticket_url ?? null,
  };
}

export async function POST(request: Request) {
  if (!env.pixEnabled) return Response.json({ error: "PIX_DISABLED" }, { status: 503 });
  if (!env.telegramBotToken) return Response.json({ error: "TELEGRAM_BOT_TOKEN_NOT_CONFIGURED" }, { status: 503 });

  let body: { initData?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  try {
    const validated = await validateTelegramMiniAppInitData(body.initData ?? "", env.telegramBotToken, { maxAgeSeconds: 3600 });
    const session = await getOrCreateMiniAppSession(validated.user);
    const supabase = getSupabaseAdmin();
    const environment = currentPaymentEnvironment();

    const latestQuery = await supabase
      .from("payments")
      .select("id,external_payment_id,status,amount_cents,qr_code_text,qr_code_base64,ticket_url")
      .eq("user_id", session.user.id)
      .eq("provider", "mercado_pago_orders")
      .eq("environment", environment)
      .in("status", ["creating", "pending", "in_process"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestQuery.error) throw latestQuery.error;
    if (!latestQuery.data) {
      return Response.json({ ok: true, payment: null, walletBalanceCents: session.wallet.balanceCents });
    }

    const local = latestQuery.data as LocalPayment;
    const externalOrderId = String(local.external_payment_id);

    if (!externalOrderId.startsWith("pending:")) {
      try {
        await reconcileMercadoPagoOrder(externalOrderId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
        console.warn("[miniapp-pix-latest] reconciliation deferred", { paymentId: local.id, environment, message });
      }
    }

    const refreshedPayment = await supabase
      .from("payments")
      .select("id,external_payment_id,status,amount_cents,qr_code_text,qr_code_base64,ticket_url")
      .eq("id", local.id)
      .eq("user_id", session.user.id)
      .eq("environment", environment)
      .maybeSingle();
    if (refreshedPayment.error) throw refreshedPayment.error;

    const refreshedSession = await getOrCreateMiniAppSession(validated.user);
    const payment = (refreshedPayment.data ?? local) as LocalPayment;

    return Response.json({
      ok: true,
      payment: toClientPayment(payment),
      walletBalanceCents: refreshedSession.wallet.balanceCents,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message.startsWith("TELEGRAM_INIT_DATA_")) return Response.json({ error: message }, { status: 401 });
    console.error("[miniapp-pix-latest] failed", { message });
    return Response.json({ error: "PIX_LATEST_FAILED" }, { status: 502 });
  }
}
