import { env } from "@/src/config/env";
import { purchaseActivation } from "@/src/activations/service";
import type { NumberKind } from "@/src/providers/types";

export async function POST(request: Request) {
  if (!env.adminApiToken || request.headers.get("authorization") !== `Bearer ${env.adminApiToken}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json() as {
    userId?: string;
    country?: string;
    operator?: string;
    product?: string;
    kind?: NumberKind;
    idempotencyKey?: string;
  };
  if (!body.userId || !body.country || !body.product || !["ONE_TIME_SMS", "TEMPORARY_HOSTING"].includes(String(body.kind))) {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    const activation = await purchaseActivation({
      userId: body.userId,
      country: body.country,
      operator: body.operator,
      product: body.product,
      kind: body.kind!,
      idempotencyKey: body.idempotencyKey,
    });
    return Response.json({ ok: true, activation });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    const expected = [
      "PURCHASES_DISABLED",
      "SERVICE_NOT_APPROVED_FOR_SALE",
      "SERVICE_BLOCKED_BY_COMPLIANCE_POLICY",
      "OFFER_NOT_AVAILABLE",
      "INSUFFICIENT_BALANCE",
    ].some((code) => message.includes(code));
    return Response.json({ ok: false, error: message }, { status: expected ? 409 : 502 });
  }
}
