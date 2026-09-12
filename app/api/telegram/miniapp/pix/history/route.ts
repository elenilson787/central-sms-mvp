import { env } from "@/src/config/env";
import { getSupabaseAdmin } from "@/src/db/supabase-server";
import { validateTelegramMiniAppInitData } from "@/src/telegram/miniapp-auth";
import { getOrCreateMiniAppSession } from "@/src/telegram/miniapp-session";

const TEST_ORDER_PATTERN = "ORDTST%";

type PaymentRow = {
  id: string;
  external_payment_id: string;
  status: string;
  amount_cents: number;
  created_at: string;
  paid_at?: string | null;
};

function toClientPayment(row: PaymentRow) {
  return {
    id: row.id,
    status: row.status,
    amountCents: Number(row.amount_cents),
    createdAt: row.created_at,
    paidAt: row.paid_at ?? null,
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

    const baseQuery = supabase
      .from("payments")
      .select("id,external_payment_id,status,amount_cents,created_at,paid_at")
      .eq("user_id", session.user.id)
      .eq("provider", "mercado_pago_orders")
      .order("created_at", { ascending: false })
      .limit(8);

    const result = env.mercadoPagoTestMode
      ? await baseQuery.or("external_payment_id.like.ORDTST%,external_payment_id.like.pending:%")
      : await baseQuery.not("external_payment_id", "like", TEST_ORDER_PATTERN);

    if (result.error) throw result.error;

    return Response.json({
      ok: true,
      payments: ((result.data ?? []) as PaymentRow[]).map(toClientPayment),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message.startsWith("TELEGRAM_INIT_DATA_")) return Response.json({ error: message }, { status: 401 });
    console.error("[miniapp-pix-history] failed", { message });
    return Response.json({ error: "PIX_HISTORY_FAILED" }, { status: 502 });
  }
}
