import { env } from "@/src/config/env";
import { purchaseActivation } from "@/src/activations/service";
import type { NumberKind } from "@/src/providers/types";

export async function POST(request: Request) {
  if (!env.adminApiToken || request.headers.get("authorization") !== `Bearer ${env.adminApiToken}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    userId?: string;
    provider?: string;
    country?: string;
    operator?: string;
    product?: string;
    kind?: NumberKind;
    idempotencyKey?: string;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (
    !body.userId
    || !body.country
    || !body.operator
    || !body.product
    || !body.idempotencyKey?.trim()
    || !["ONE_TIME_SMS", "TEMPORARY_HOSTING"].includes(String(body.kind))
  ) {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    const activation = await purchaseActivation({
      userId: body.userId,
      provider: body.provider ?? "smspool",
      country: body.country,
      operator: body.operator,
      product: body.product,
      kind: body.kind!,
      idempotencyKey: body.idempotencyKey,
    });
    return Response.json({ ok: true, activation });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    const conflictCodes = [
      "PURCHASES_DISABLED",
      "SMSPOOL_COMMERCIAL_APPROVAL_REQUIRED",
      "SMSPOOL_API_KEY_NOT_CONFIGURED",
      "SERVICE_NOT_APPROVED_FOR_SALE",
      "SERVICE_BLOCKED_BY_COMPLIANCE_POLICY",
      "OFFER_NOT_AVAILABLE",
      "INSUFFICIENT_BALANCE",
      "PRICING_NOT_CONFIGURED",
      "RENTAL_PURCHASE_NOT_IMPLEMENTED",
      "PROVIDER_NOT_SUPPORTED_FOR_PURCHASE",
      "IDEMPOTENCY_KEY_REQUIRED",
      "SMSPOOL_POOL_REQUIRED",
    ];
    const expected = conflictCodes.some((code) => message.includes(code));
    return Response.json({ ok: false, error: message }, { status: expected ? 409 : 502 });
  }
}
