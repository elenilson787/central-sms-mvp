import { env } from "@/src/config/env";
import { refreshWaitingActivations } from "@/src/activations/service";

export async function POST(request: Request) {
  if (!env.cronSecret) return Response.json({ error: "CRON_SECRET_NOT_CONFIGURED" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const results = await refreshWaitingActivations(25);
  return Response.json({ ok: true, checked: results.length, results });
}
