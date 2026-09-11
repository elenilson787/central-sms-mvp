import { env } from "@/src/config/env";
import { getSupabaseAdmin } from "@/src/db/supabase-server";

function hasAdminAccess(request: Request) {
  if (!env.adminApiToken) return false;
  return request.headers.get("authorization") === `Bearer ${env.adminApiToken}`;
}

export async function GET(request: Request) {
  if (!hasAdminAccess(request)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const configured = {
    supabaseUrl: Boolean(env.supabaseUrl),
    supabaseSecretKey: Boolean(env.supabaseSecretKey),
  };

  if (!configured.supabaseUrl || !configured.supabaseSecretKey) {
    return Response.json({ ok: false, configured, stage: "configuration" }, { status: 503 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { error: usersError } = await supabase
      .from("app_users")
      .select("id", { count: "exact", head: true });

    if (usersError) {
      return Response.json({
        ok: false,
        configured,
        stage: "app_users_read",
        errorCode: usersError.code ?? null,
        errorMessage: usersError.message,
      }, { status: 500 });
    }

    const { error: walletsError } = await supabase
      .from("wallets")
      .select("id", { count: "exact", head: true });

    if (walletsError) {
      return Response.json({
        ok: false,
        configured,
        stage: "wallets_read",
        errorCode: walletsError.code ?? null,
        errorMessage: walletsError.message,
      }, { status: 500 });
    }

    return Response.json({
      ok: true,
      configured,
      checks: ["app_users_read", "wallets_read"],
    });
  } catch (error) {
    return Response.json({
      ok: false,
      configured,
      stage: "client_or_network",
      errorMessage: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    }, { status: 500 });
  }
}
