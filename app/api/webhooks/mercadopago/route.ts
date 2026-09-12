import { reconcileMercadoPagoOrder } from "@/src/payments/reconcile";
import { verifyMercadoPagoWebhookSignature } from "@/src/payments/mercadopago";

type MercadoPagoWebhookBody = {
  action?: string;
  data?: { id?: string | number };
  live_mode?: boolean;
  type?: string;
};

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = await request.json().catch(() => ({})) as MercadoPagoWebhookBody;
  const signatureDataId = url.searchParams.get("data.id");
  const resourceId = signatureDataId ?? (body.data?.id != null ? String(body.data.id) : null);
  const notificationType = url.searchParams.get("type") ?? body.type;
  const xRequestId = request.headers.get("x-request-id");
  const xSignature = request.headers.get("x-signature");

  console.info("[mercadopago-webhook] received", {
    resourceId,
    notificationType,
    action: body.action ?? null,
    liveMode: body.live_mode ?? null,
    hasRequestId: Boolean(xRequestId),
    hasSignature: Boolean(xSignature),
  });

  const valid = verifyMercadoPagoWebhookSignature({
    xSignature,
    xRequestId,
    dataId: signatureDataId,
  });
  if (!valid) {
    console.warn("[mercadopago-webhook] invalid signature", {
      resourceId,
      notificationType,
      liveMode: body.live_mode ?? null,
    });
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  if (notificationType && notificationType !== "order") {
    console.info("[mercadopago-webhook] ignored unsupported type", { resourceId, notificationType });
    return Response.json({ ok: true, ignored: "unsupported_notification_type" });
  }
  if (!resourceId) {
    console.info("[mercadopago-webhook] ignored missing data id", { notificationType, action: body.action ?? null });
    return Response.json({ ok: true, ignored: "no_data_id" });
  }

  try {
    const result = await reconcileMercadoPagoOrder(resourceId);
    console.info("[mercadopago-webhook] reconciled", {
      resourceId,
      action: body.action ?? null,
      liveMode: body.live_mode ?? null,
      paymentStatus: "paymentStatus" in result ? result.paymentStatus : null,
      credited: "credited" in result ? result.credited : false,
      ignored: "ignored" in result ? result.ignored : null,
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error("[mercadopago-webhook] order reconciliation failed", {
      resourceId,
      action: body.action ?? null,
      liveMode: body.live_mode ?? null,
      message,
    });
    return Response.json({ error: "reconciliation_failed" }, { status: 500 });
  }
}
