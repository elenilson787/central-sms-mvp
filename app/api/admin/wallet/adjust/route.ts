import { randomUUID } from "node:crypto";
import { env } from "@/src/config/env";
import { applyWalletTransaction } from "@/src/wallet/service";
import { logAudit } from "@/src/audit/log";

export async function POST(request: Request) {
  if (!env.adminApiToken || request.headers.get("authorization") !== `Bearer ${env.adminApiToken}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json() as { userId?: string; amountCents?: number; reason?: string; idempotencyKey?: string };
  if (!body.userId || !Number.isInteger(body.amountCents) || body.amountCents === 0 || !body.reason?.trim()) {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    const result = await applyWalletTransaction({
      userId: body.userId,
      type: "adjustment",
      amountCents: body.amountCents!,
      referenceId: `admin-adjustment:${body.idempotencyKey ?? randomUUID()}`,
      metadata: { reason: body.reason.trim() },
    });
    await logAudit({ actorType: "admin", actorId: "admin-api", action: "wallet.adjust", entityType: "user", entityId: body.userId, metadata: { amountCents: body.amountCents, reason: body.reason.trim() } });
    return Response.json({ ok: true, result });
  } catch (error) {
    return Response.json({ ok: false, error: String(error instanceof Error ? error.message : error) }, { status: 409 });
  }
}
