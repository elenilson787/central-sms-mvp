import { reconcileMercadoPagoOrder } from "@/src/payments/reconcile";
import { verifyMercadoPagoWebhookSignature } from "@/src/payments/mercadopago";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = await request.json().catch(() => ({})) as { data?: { id?: string | number }; type?: string };
  const signatureDataId = url.searchParams.get("data.id");
  const resourceId = signatureDataId ?? (body.data?.id != null ? String(body.data.id) : null);

  const valid = verifyMercadoPagoWebhookSignature({
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    dataId: signatureDataId,
  });
  if (!valid) return Response.json({ error: "invalid_signature" }, { status: 401 });

  const notificationType = url.searchParams.get("type") ?? body.type;
  if (notificationType && notificationType !== "order") {
    return Response.json({ ok: true, ignored: "unsupported_notification_type" });
  }
  if (!resourceId) return Response.json({ ok: true, ignored: "no_data_id" });

  try {
    const result = await reconcileMercadoPagoOrder(resourceId);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error("[mercadopago-webhook] order reconciliation failed", { resourceId, message });
    return Response.json({ error: "reconciliation_failed" }, { status: 500 });
  }
}
