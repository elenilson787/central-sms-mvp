import { logAudit } from "@/src/audit/log";
import { reconcileMercadoPagoOrder } from "@/src/payments/reconcile";
import { verifyMercadoPagoWebhookSignature } from "@/src/payments/mercadopago";

type MercadoPagoWebhookBody = {
  action?: string;
  data?: { id?: string | number };
  live_mode?: boolean;
  type?: string;
};

async function auditWebhook(input: {
  action: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await logAudit({
      actorType: "mercado_pago",
      actorId: "webhook",
      action: input.action,
      entityType: "payment_order",
      entityId: input.resourceId ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.warn("[mercadopago-webhook] audit write failed", { action: input.action, message });
  }
}

function safeErrorCategory(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  return message.split(":").slice(0, 3).join(":").slice(0, 180);
}

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
    await auditWebhook({
      action: "mercadopago.webhook.ignored",
      resourceId,
      metadata: { reason: "unsupported_notification_type", notificationType, liveMode: body.live_mode ?? null },
    });
    return Response.json({ ok: true, ignored: "unsupported_notification_type" });
  }
  if (!resourceId) {
    console.info("[mercadopago-webhook] ignored missing data id", { notificationType, action: body.action ?? null });
    await auditWebhook({
      action: "mercadopago.webhook.ignored",
      metadata: { reason: "no_data_id", notificationType: notificationType ?? null, liveMode: body.live_mode ?? null },
    });
    return Response.json({ ok: true, ignored: "no_data_id" });
  }

  await auditWebhook({
    action: "mercadopago.webhook.accepted",
    resourceId,
    metadata: {
      notificationType: notificationType ?? "order",
      providerAction: body.action ?? null,
      liveMode: body.live_mode ?? null,
      hasRequestId: Boolean(xRequestId),
    },
  });

  try {
    const result = await reconcileMercadoPagoOrder(resourceId);
    const paymentStatus = "paymentStatus" in result ? result.paymentStatus : null;
    const credited = "credited" in result ? result.credited : false;
    const ignored = "ignored" in result ? result.ignored : null;

    console.info("[mercadopago-webhook] reconciled", {
      resourceId,
      action: body.action ?? null,
      liveMode: body.live_mode ?? null,
      paymentStatus,
      credited,
      ignored,
    });

    await auditWebhook({
      action: "mercadopago.webhook.reconciled",
      resourceId,
      metadata: {
        providerAction: body.action ?? null,
        liveMode: body.live_mode ?? null,
        paymentStatus,
        credited,
        ignored,
      },
    });

    return Response.json(result);
  } catch (error) {
    const errorCategory = safeErrorCategory(error);
    console.error("[mercadopago-webhook] order reconciliation failed", {
      resourceId,
      action: body.action ?? null,
      liveMode: body.live_mode ?? null,
      errorCategory,
    });

    await auditWebhook({
      action: "mercadopago.webhook.failed",
      resourceId,
      metadata: {
        providerAction: body.action ?? null,
        liveMode: body.live_mode ?? null,
        errorCategory,
      },
    });

    return Response.json({ error: "reconciliation_failed" }, { status: 500 });
  }
}
