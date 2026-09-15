import { getSupabaseAdmin } from "@/src/db/supabase-server";
import { isAdminRequest } from "@/src/security/admin-auth";

function metadataSource(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return "direct";
  const source = (metadata as Record<string, unknown>).source;
  return typeof source === "string" && source.trim() ? source.trim().toLowerCase() : "direct";
}

function numberValue(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [auditResult, activationsResult, paymentsResult] = await Promise.all([
    supabase
      .from("audit_logs")
      .select("actor_id,action,metadata,created_at")
      .in("action", ["bot_start", "miniapp_open"])
      .gte("created_at", since24h)
      .order("created_at", { ascending: true })
      .limit(5000),
    supabase
      .from("activations")
      .select("user_id,status,sale_price_cents,created_at")
      .eq("provider", "smspool")
      .eq("kind", "ONE_TIME_SMS")
      .gte("created_at", since24h)
      .limit(1000),
    supabase
      .from("payments")
      .select("user_id,status,amount_cents,paid_at,created_at,updated_at")
      .eq("environment", "production")
      .gte("updated_at", since24h)
      .limit(1000),
  ]);

  if (auditResult.error || activationsResult.error || paymentsResult.error) {
    console.error("[acquisition-dashboard] query failed", {
      audit: auditResult.error?.message,
      activations: activationsResult.error?.message,
      payments: paymentsResult.error?.message,
    });
    return Response.json({ error: "acquisition_dashboard_query_failed" }, { status: 502 });
  }

  const audits = auditResult.data ?? [];
  const activations = activationsResult.data ?? [];
  const payments = paymentsResult.data ?? [];

  const arrivalSourceByTelegram = new Map<string, string>();
  const arrivalsBySource = new Map<string, Set<string>>();
  for (const row of audits) {
    if (String(row.action) !== "bot_start") continue;
    const telegramId = String(row.actor_id ?? "");
    if (!telegramId || arrivalSourceByTelegram.has(telegramId)) continue;
    const source = metadataSource(row.metadata);
    arrivalSourceByTelegram.set(telegramId, source);
    if (!arrivalsBySource.has(source)) arrivalsBySource.set(source, new Set());
    arrivalsBySource.get(source)!.add(telegramId);
  }

  const openedBySource = new Map<string, Set<string>>();
  for (const row of audits) {
    if (String(row.action) !== "miniapp_open") continue;
    const telegramId = String(row.actor_id ?? "");
    const source = arrivalSourceByTelegram.get(telegramId);
    if (!source) continue;
    if (!openedBySource.has(source)) openedBySource.set(source, new Set());
    openedBySource.get(source)!.add(telegramId);
  }

  const businessUserIds = Array.from(new Set([
    ...activations.map((row) => String(row.user_id)),
    ...payments.map((row) => String(row.user_id)),
  ].filter(Boolean)));

  let appUsers: Array<{ id: string; telegram_user_id: string | number }> = [];
  if (businessUserIds.length) {
    const usersResult = await supabase
      .from("app_users")
      .select("id,telegram_user_id")
      .in("id", businessUserIds);
    if (usersResult.error) {
      console.error("[acquisition-dashboard] app user lookup failed", usersResult.error.message);
      return Response.json({ error: "acquisition_user_lookup_failed" }, { status: 502 });
    }
    appUsers = (usersResult.data ?? []) as Array<{ id: string; telegram_user_id: string | number }>;
  }

  const telegramByUserId = new Map(appUsers.map((row) => [String(row.id), String(row.telegram_user_id)]));
  const rechargersBySource = new Map<string, Set<string>>();
  const buyersBySource = new Map<string, Set<string>>();
  const pixCentsBySource = new Map<string, number>();
  const revenueCentsBySource = new Map<string, number>();

  for (const payment of payments) {
    if (String(payment.status) !== "approved") continue;
    const paidAt = Date.parse(String(payment.paid_at ?? payment.created_at));
    if (!Number.isFinite(paidAt) || paidAt < Date.parse(since24h)) continue;
    const userId = String(payment.user_id);
    const telegramId = telegramByUserId.get(userId);
    if (!telegramId) continue;
    const source = arrivalSourceByTelegram.get(telegramId);
    if (!source) continue;
    if (!rechargersBySource.has(source)) rechargersBySource.set(source, new Set());
    rechargersBySource.get(source)!.add(userId);
    pixCentsBySource.set(source, (pixCentsBySource.get(source) ?? 0) + Math.max(0, Math.trunc(numberValue(payment.amount_cents))));
  }

  for (const activation of activations) {
    const userId = String(activation.user_id);
    const telegramId = telegramByUserId.get(userId);
    if (!telegramId) continue;
    const source = arrivalSourceByTelegram.get(telegramId);
    if (!source) continue;
    if (!buyersBySource.has(source)) buyersBySource.set(source, new Set());
    buyersBySource.get(source)!.add(userId);
    if (String(activation.status) !== "refunded") {
      revenueCentsBySource.set(source, (revenueCentsBySource.get(source) ?? 0) + Math.max(0, Math.trunc(numberValue(activation.sale_price_cents))));
    }
  }

  const sourceNames = Array.from(new Set([
    ...arrivalsBySource.keys(),
    ...openedBySource.keys(),
    ...rechargersBySource.keys(),
    ...buyersBySource.keys(),
  ]));

  const sources = sourceNames.map((source) => ({
    source,
    arrivals: arrivalsBySource.get(source)?.size ?? 0,
    appOpens: openedBySource.get(source)?.size ?? 0,
    rechargers: rechargersBySource.get(source)?.size ?? 0,
    pixCents: pixCentsBySource.get(source) ?? 0,
    buyers: buyersBySource.get(source)?.size ?? 0,
    revenueCents: revenueCentsBySource.get(source) ?? 0,
  })).sort((a, b) => b.arrivals - a.arrivals || b.revenueCents - a.revenueCents);

  const totals = sources.reduce((acc, row) => ({
    arrivals: acc.arrivals + row.arrivals,
    appOpens: acc.appOpens + row.appOpens,
    rechargers: acc.rechargers + row.rechargers,
    pixCents: acc.pixCents + row.pixCents,
    buyers: acc.buyers + row.buyers,
    revenueCents: acc.revenueCents + row.revenueCents,
  }), { arrivals: 0, appOpens: 0, rechargers: 0, pixCents: 0, buyers: 0, revenueCents: 0 });

  return Response.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    windowHours: 24,
    attribution: "first_start_in_window",
    totals: {
      ...totals,
      botToAppPercent: totals.arrivals > 0 ? (totals.appOpens / totals.arrivals) * 100 : null,
      appToBuyerPercent: totals.appOpens > 0 ? (totals.buyers / totals.appOpens) * 100 : null,
    },
    sources,
  });
}
