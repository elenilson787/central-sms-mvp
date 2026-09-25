import { getSupabaseAdmin } from "@/src/db/supabase-server";
import { isAdminRequest } from "@/src/security/admin-auth";

function clean(value: string | null) {
  const v = String(value ?? "").trim();
  return v || null;
}

function actionLabel(action: string) {
  return action.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const from = clean(url.searchParams.get("from"));
  const to = clean(url.searchParams.get("to"));
  const actor = clean(url.searchParams.get("actor"));
  const action = clean(url.searchParams.get("action"));
  const limit = Math.min(2000, Math.max(50, Number(url.searchParams.get("limit") ?? 500) || 500));

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("audit_logs")
    .select("id,actor_type,actor_id,action,entity_type,entity_id,metadata,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (from) query = query.gte("created_at", new Date(from).toISOString());
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    query = query.lte("created_at", end.toISOString());
  }
  if (actor) query = query.ilike("actor_id", `%${actor}%`);
  if (action) query = query.eq("action", action);

  const { data, error } = await query;
  if (error) {
    console.error("[admin-history] query failed", error.message);
    return Response.json({ error: "ADMIN_HISTORY_QUERY_FAILED" }, { status: 502 });
  }

  const rows = data ?? [];
  const telegramIds = Array.from(new Set(
    rows.filter((r) => String(r.actor_type) === "user" && r.actor_id).map((r) => String(r.actor_id))
  ));

  const usersByTelegram = new Map<string, { username: string | null; first_name: string | null; last_name: string | null }>();
  if (telegramIds.length) {
    const { data: users } = await supabase
      .from("app_users")
      .select("telegram_user_id,username,first_name,last_name")
      .in("telegram_user_id", telegramIds.map((id) => Number(id)).filter(Number.isFinite));
    for (const user of users ?? []) {
      usersByTelegram.set(String(user.telegram_user_id), {
        username: user.username ?? null,
        first_name: user.first_name ?? null,
        last_name: user.last_name ?? null,
      });
    }
  }

  const actions = Array.from(new Set(rows.map((r) => String(r.action)))).sort();

  return Response.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    count: rows.length,
    actions,
    logs: rows.map((row) => {
      const actorId = row.actor_id == null ? null : String(row.actor_id);
      const user = actorId ? usersByTelegram.get(actorId) : undefined;
      const actorName = user
        ? [user.first_name, user.last_name].filter(Boolean).join(" ") || (user.username ? `@${user.username}` : actorId)
        : String(row.actor_type) === "admin" ? "Administrador" : actorId ?? String(row.actor_type);
      return {
        id: String(row.id),
        createdAt: String(row.created_at),
        actorType: String(row.actor_type),
        actorId,
        actorName,
        action: String(row.action),
        actionLabel: actionLabel(String(row.action)),
        entityType: row.entity_type ? String(row.entity_type) : null,
        entityId: row.entity_id ? String(row.entity_id) : null,
        metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
      };
    }),
  });
}
