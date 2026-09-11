import { getSupabaseAdmin } from "@/src/db/supabase-server";
import { getPayment, verifyMercadoPagoWebhookSignature } from "@/src/payments/mercadopago";
import { applyWalletTransaction } from "@/src/wallet/service";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = await request.json().catch(() => ({})) as { data?: { id?: string | number }; type?: string };
  const dataId = url.searchParams.get("data.id") ?? (body.data?.id != null ? String(body.data.id) : null);
  const valid = verifyMercadoPagoWebhookSignature({
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    dataId,
  });
  if (!valid) return Response.json({ error: "invalid_signature" }, { status: 401 });
  if (!dataId) return Response.json({ ok: true, ignored: "no_data_id" });

  const payment = await getPayment(dataId);
  const supabase = getSupabaseAdmin();
  const { data: local, error } = await supabase.from("payments").select("*").eq("external_payment_id", String(payment.id)).maybeSingle();
  if (error) throw error;
  if (!local) return Response.json({ ok: true, ignored: "unknown_payment" });

  const normalizedStatus = String(payment.status ?? "unknown");
  await supabase.from("payments").update({ status: normalizedStatus, paid_at: normalizedStatus === "approved" ? new Date().toISOString() : local.paid_at, updated_at: new Date().toISOString() }).eq("id", local.id);

  if (normalizedStatus === "approved") {
    await applyWalletTransaction({
      userId: local.user_id,
      type: "deposit",
      amountCents: Number(local.amount_cents),
      referenceId: `payment:${local.id}:credit`,
      metadata: { external_payment_id: String(payment.id) },
    });
  }
  return Response.json({ ok: true });
}
