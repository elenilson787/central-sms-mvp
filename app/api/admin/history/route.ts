import { getSupabaseAdmin } from "@/src/db/supabase-server";
import { isAdminRequest } from "@/src/security/admin-auth";

function clean(value: string | null) {
  const v = String(value ?? "").trim();
  return v || null;
}

function actionLabel(action: string) {
  return action.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function dateBounds(from: string | null, to: string | null) {
  return {
    fromIso: from ? new Date(from).toISOString() : null,
    toIso: to ? (() => {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      return end.toISOString();
    })() : null,
  };
}

async function fetchAll<T>(queryFactory: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = [];
  const pageSize = 1000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await queryFactory(start, start + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    out.push(...page);
    if (page.length < pageSize) break;
    if (start >= 100000) break;
  }
  return out;
}

function userLabel(user: { first_name?: string | null; last_name?: string | null; username?: string | null; telegram_user_id?: number | null }, fallback: string) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (user.username) return `@${user.username}`;
  return user.telegram_user_id != null ? `Telegram ${user.telegram_user_id}` : fallback;
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const from = clean(url.searchParams.get("from"));
  const to = clean(url.searchParams.get("to"));
  const actor = clean(url.searchParams.get("actor"));
  const action = clean(url.searchParams.get("action"));
  const limit = Math.min(2000, Math.max(50, Number(url.searchParams.get("limit") ?? 500) || 500));
  const { fromIso, toIso } = dateBounds(from, to);
  const supabase = getSupabaseAdmin();

  let logQuery = supabase
    .from("audit_logs")
    .select("id,actor_type,actor_id,action,entity_type,entity_id,metadata,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (fromIso) logQuery = logQuery.gte("created_at", fromIso);
  if (toIso) logQuery = logQuery.lte("created_at", toIso);
  if (actor) logQuery = logQuery.ilike("actor_id", `%${actor}%`);
  if (action) logQuery = logQuery.eq("action", action);

  try {
    const [logsResult, users, payments, activations, refunds] = await Promise.all([
      logQuery,
      fetchAll<any>((start, end) => {
        let q = supabase.from("app_users").select("id,telegram_user_id,username,first_name,last_name,created_at").order("created_at", { ascending: false }).range(start, end);
        if (fromIso) q = q.gte("created_at", fromIso);
        if (toIso) q = q.lte("created_at", toIso);
        return q;
      }),
      fetchAll<any>((start, end) => {
        let q = supabase.from("payments").select("id,user_id,amount_cents,status,environment,created_at,paid_at").eq("environment", "production").order("created_at", { ascending: false }).range(start, end);
        if (fromIso) q = q.gte("paid_at", fromIso);
        if (toIso) q = q.lte("paid_at", toIso);
        return q;
      }),
      fetchAll<any>((start, end) => {
        let q = supabase.from("activations").select("id,user_id,product,status,sale_price_cents,provider_cost,provider_currency,created_at").eq("provider", "smspool").eq("kind", "ONE_TIME_SMS").order("created_at", { ascending: false }).range(start, end);
        if (fromIso) q = q.gte("created_at", fromIso);
        if (toIso) q = q.lte("created_at", toIso);
        return q;
      }),
      fetchAll<any>((start, end) => {
        let q = supabase.from("payment_refunds").select("id,user_id,payment_id,amount_cents,status,created_at,completed_at").eq("environment", "production").order("created_at", { ascending: false }).range(start, end);
        if (fromIso) q = q.gte("created_at", fromIso);
        if (toIso) q = q.lte("created_at", toIso);
        return q;
      }),
    ]);

    if (logsResult.error) throw logsResult.error;
    const rows = logsResult.data ?? [];

    const userById = new Map<string, any>();
    for (const user of users) userById.set(String(user.id), user);

    const depositByUser = new Map<string, { cents: number; count: number }>();
    let depositedCents = 0;
    let depositingUsers = 0;
    for (const payment of payments) {
      if (String(payment.status) !== "approved") continue;
      const cents = Math.max(0, Math.trunc(Number(payment.amount_cents) || 0));
      if (!cents) continue;
      depositedCents += cents;
      const key = String(payment.user_id);
      const current = depositByUser.get(key) ?? { cents: 0, count: 0 };
      current.cents += cents;
      current.count += 1;
      depositByUser.set(key, current);
    }
    depositingUsers = depositByUser.size;

    const spendByUser = new Map<string, { cents: number; count: number; completed: number; refunded: number }>();
    let spentCents = 0;
    let purchases = 0;
    let smsReceived = 0;
    for (const activation of activations) {
      const status = String(activation.status);
      if (status === "refunded") continue;
      const cents = Math.max(0, Math.trunc(Number(activation.sale_price_cents) || 0));
      spentCents += cents;
      purchases += 1;
      if (status === "sms_received" || status === "completed") smsReceived += 1;
      const key = String(activation.user_id);
      const current = spendByUser.get(key) ?? { cents: 0, count: 0, completed: 0, refunded: 0 };
      current.cents += cents;
      current.count += 1;
      if (status === "sms_received" || status === "completed") current.completed += 1;
      if (status === "refunded") current.refunded += 1;
      spendByUser.set(key, current);
    }

    const refundedCents = refunds.filter((r) => String(r.status) === "completed")
      .reduce((sum, r) => sum + Math.max(0, Math.trunc(Number(r.amount_cents) || 0)), 0);

    const actorIds = Array.from(new Set(rows.filter((r: any) => String(r.actor_type) === "user" && r.actor_id).map((r: any) => String(r.actor_id))));
    const usersByTelegram = new Map<string, any>();
    for (const user of users) usersByTelegram.set(String(user.telegram_user_id), user);

    const actions = Array.from(new Set(rows.map((r: any) => String(r.action)))).sort();
    const logs = rows.map((row: any) => {
      const actorId = row.actor_id == null ? null : String(row.actor_id);
      const user = actorId ? usersByTelegram.get(actorId) : undefined;
      const actorName = user ? userLabel(user, actorId) : String(row.actor_type) === "admin" ? "Administrador" : actorId ?? String(row.actor_type);
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
    });

    const userIds = new Set<string>([...depositByUser.keys(), ...spendByUser.keys()]);
    const userRows = Array.from(userIds).map((id) => {
      const user = userById.get(id);
      const deposit = depositByUser.get(id)?.cents ?? 0;
      const depositCount = depositByUser.get(id)?.count ?? 0;
      const spend = spendByUser.get(id)?.cents ?? 0;
      const purchaseCount = spendByUser.get(id)?.count ?? 0;
      return {
        userId: id,
        name: user ? userLabel(user, id) : `Usuário ${id.slice(0, 8)}`,
        username: user?.username ?? null,
        telegramUserId: user?.telegram_user_id != null ? String(user.telegram_user_id) : null,
        depositedCents: deposit,
        depositCount,
        spentCents: spend,
        purchaseCount,
        balanceMovementCents: deposit - spend,
      };
    }).sort((a, b) => (b.depositedCents + b.spentCents) - (a.depositedCents + a.spentCents));

    const categories = {
      financeiro: {
        label: "Financeiro",
        deposits: depositedCents,
        depositors: depositingUsers,
        refunds: refundedCents,
      },
      compras: {
        label: "Compras de SMS",
        purchases,
        spent: spentCents,
        smsReceived,
      },
      usuarios: {
        label: "Usuários",
        distinctUsers: users.length,
        usersWithFinancialActivity: userRows.length,
      },
      auditoria: {
        label: "Auditoria",
        records: rows.length,
      },
    };

    return Response.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      period: { from, to, label: from || to ? "Período filtrado" : "Todo o período" },
      count: rows.length,
      actions,
      categories,
      users: userRows,
      logs,
    });
  } catch (error) {
    console.error("[admin-history] query failed", error);
    return Response.json({ error: "ADMIN_HISTORY_QUERY_FAILED" }, { status: 502 });
  }
}
