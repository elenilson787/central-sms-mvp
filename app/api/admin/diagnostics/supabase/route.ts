import { env } from "@/src/config/env";
import { getSupabaseAdmin } from "@/src/db/supabase-server";

function hasAdminAccess(request: Request) {
  if (!env.adminApiToken) return false;
  return request.headers.get("authorization") === `Bearer ${env.adminApiToken}`;
}

function secretKeyKind(value?: string) {
  if (!value) return "missing";
  if (value.startsWith("sb_secret_")) return "sb_secret";
  if (value.startsWith("eyJ")) return "legacy_jwt";
  return "unknown";
}

export async function GET(request: Request) {
  if (!hasAdminAccess(request)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const configured = {
    supabaseUrl: Boolean(env.supabaseUrl),
    supabaseSecretKey: Boolean(env.supabaseSecretKey),
    secretKeyKind: secretKeyKind(env.supabaseSecretKey),
  };

  if (!configured.supabaseUrl || !configured.supabaseSecretKey) {
    return Response.json({ ok: false, configured, stage: "configuration" }, { status: 503 });
  }

  try {
    const restUrl = new URL("/rest/v1/app_users?select=id&limit=1", env.supabaseUrl).toString();
    const restResponse = await fetch(restUrl, {
      method: "GET",
      headers: {
        apikey: env.supabaseSecretKey!,
        accept: "application/json",
      },
    });

    if (!restResponse.ok) {
      const body = (await restResponse.text()).slice(0, 500);
      return Response.json({
        ok: false,
        configured,
        stage: "rest_probe",
        httpStatus: restResponse.status,
        contentType: restResponse.headers.get("content-type"),
        responseBody: body,
      }, { status: 500 });
    }

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
        errorMessage: usersError.message ?? null,
        errorDetails: usersError.details ?? null,
        errorHint: usersError.hint ?? null,
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
        errorMessage: walletsError.message ?? null,
        errorDetails: walletsError.details ?? null,
        errorHint: walletsError.hint ?? null,
      }, { status: 500 });
    }

    return Response.json({
      ok: true,
      configured,
      checks: ["rest_probe", "app_users_read", "wallets_read"],
    });
  } catch (error) {
    return Response.json({
      ok: false,
      configured,
      stage: "client_or_network",
      errorName: error instanceof Error ? error.name : null,
      errorMessage: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    }, { status: 500 });
  }
}
