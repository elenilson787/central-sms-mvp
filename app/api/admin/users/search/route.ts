import { getSupabaseAdmin } from "@/src/db/supabase-server";
import { isAdminRequest } from "@/src/security/admin-auth";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function cleanUsernameQuery(value: string) {
  return value.replace(/^@/, "").replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 64);
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { query?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const query = String(body.query ?? "").trim();
  if (!query) return Response.json({ error: "query_required" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  let usersQuery = supabase
    .from("app_users")
    .select("id,telegram_user_id,username,first_name,last_name,status,created_at")
    .limit(10);

  if (/^\d{5,20}$/.test(query)) {
    usersQuery = usersQuery.eq("telegram_user_id", query);
  } else if (isUuid(query)) {
    usersQuery = usersQuery.eq("id", query);
  } else {
    const username = cleanUsernameQuery(query);
    if (!username) return Response.json({ error: "invalid_query" }, { status: 400 });
    usersQuery = usersQuery.ilike("username", `%${username}%`);
  }

  const usersResult = await usersQuery;
  if (usersResult.error) return Response.json({ error: "lookup_failed" }, { status: 502 });

  const users = usersResult.data ?? [];
  const ids = users.map((user) => user.id);
  if (!ids.length) return Response.json({ ok: true, users: [] });

  const [walletsResult, paymentsResult, activationsResult] = await Promise.all([
    supabase.from("wallets").select("user_id,balance_cents,currency").in("user_id", ids),
    supabase
      .from("payments")
      .select("id,user_id,environment,amount_cents,status,created_at,paid_at")
      .in("user_id", ids)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("activations")
      .select("id,user_id,provider,country,product,kind,status,sale_price_cents,created_at")
      .in("user_id", ids)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  if (walletsResult.error || paymentsResult.error || activationsResult.error) {
    return Response.json({ error: "related_data_failed" }, { status: 502 });
  }

  return Response.json({
    ok: true,
    users: users.map((user) => ({
      ...user,
      wallet: (walletsResult.data ?? []).find((wallet) => wallet.user_id === user.id) ?? null,
      recentPayments: (paymentsResult.data ?? []).filter((payment) => payment.user_id === user.id).slice(0, 8),
      recentActivations: (activationsResult.data ?? []).filter((activation) => activation.user_id === user.id).slice(0, 8),
    })),
  });
}
