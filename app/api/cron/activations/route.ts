import { env } from "@/src/config/env";
import { refreshSmsPoolWaitingActivations } from "@/src/activations/provider-refresh";

export async function POST(request: Request) {
  if (!env.cronSecret) return Response.json({ error: "CRON_SECRET_NOT_CONFIGURED" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const results = await refreshSmsPoolWaitingActivations(25);
  return Response.json({ ok: true, checked: results.length, results });
}
