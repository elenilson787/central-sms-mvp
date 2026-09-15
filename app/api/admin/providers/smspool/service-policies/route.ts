import { getSmsPoolCatalogBlockReason } from "@/src/compliance/smspool-catalog";
import { isRiskCategoryBlocked } from "@/src/compliance/policy";
import { getSupabaseAdmin } from "@/src/db/supabase-server";
import { retrieveSmsPoolCountries, retrieveSmsPoolPricing, type SmsPoolPricing } from "@/src/providers/smspool/client";
import { isAdminRequest } from "@/src/security/admin-auth";

const POPULAR_SERVICES = [
  { label: "Discord", aliases: ["discord"] },
  { label: "Telegram", aliases: ["telegram"] },
  { label: "Google", aliases: ["google", "gmail"] },
  { label: "Microsoft", aliases: ["microsoft", "outlook", "hotmail"] },
  { label: "Steam", aliases: ["steam"] },
  { label: "TikTok", aliases: ["tiktok", "tik tok"] },
  { label: "Instagram", aliases: ["instagram"] },
  { label: "Facebook", aliases: ["facebook"] },
  { label: "YouTube", aliases: ["youtube", "you tube"] },
] as const;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function numeric(value: string | number | undefined | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function matchScore(serviceName: string, aliases: readonly string[]) {
  const name = normalize(serviceName);
  let best = 0;
  for (const rawAlias of aliases) {
    const alias = normalize(rawAlias);
    if (name === alias) best = Math.max(best, 100);
    else if (name.startsWith(`${alias} `) || name.endsWith(` ${alias}`)) best = Math.max(best, 80);
    else if (name.includes(alias)) best = Math.max(best, 60);
  }
  return best;
}

async function brazilPricing() {
  const countries = await retrieveSmsPoolCountries();
  const brazil = countries.find((country) => String(country.short_name).toUpperCase() === "BR");
  if (!brazil) throw new Error("SMSPOOL_BRAZIL_NOT_FOUND");
  const pricing = await retrieveSmsPoolPricing({ country: brazil.ID });
  return pricing.filter((row) => numeric(row.price) > 0);
}

function findPopularRows(pricing: SmsPoolPricing[]) {
  return POPULAR_SERVICES.map((popular) => {
    const candidates = pricing
      .map((row) => ({ row, score: matchScore(String(row.service_name ?? ""), popular.aliases) }))
      .filter(({ row, score }) => score > 0 && getSmsPoolCatalogBlockReason(String(row.service_name ?? "")) === null)
      .sort((a, b) => b.score - a.score || numeric(a.row.price) - numeric(b.row.price));

    const best = candidates[0]?.row ?? null;
    const matchingPools = best
      ? pricing.filter((row) => String(row.service) === String(best.service))
      : [];

    return {
      label: popular.label,
      providerAvailable: Boolean(best),
      product: best ? String(best.service) : null,
      serviceName: best ? String(best.service_name) : null,
      poolCount: new Set(matchingPools.map((row) => String(row.pool))).size,
      minProviderPrice: matchingPools.length ? Math.min(...matchingPools.map((row) => numeric(row.price))) : null,
      complianceBlockReason: best ? getSmsPoolCatalogBlockReason(String(best.service_name)) : null,
    };
  });
}

async function policyMap() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("service_policies")
    .select("product,enabled,risk_category,notes")
    .eq("provider", "smspool");
  if (error) throw error;
  return new Map((data ?? []).map((row: { product: string; enabled: boolean; risk_category: string; notes: string | null }) => [String(row.product), row]));
}

async function snapshot() {
  const pricing = await brazilPricing();
  const popular = findPopularRows(pricing);
  const policies = await policyMap();
  return popular.map((item) => {
    const policy = item.product ? policies.get(item.product) : undefined;
    return {
      ...item,
      enabled: Boolean(policy?.enabled),
      riskCategory: policy?.risk_category ?? null,
      notes: policy?.notes ?? null,
      blockedByRiskCategory: policy ? isRiskCategoryBlocked(policy.risk_category) : false,
    };
  });
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json({ ok: true, country: "BR", services: await snapshot() });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "SERVICE_POLICY_DIAGNOSTICS_FAILED";
    console.error("[smspool-service-policies] GET failed", { message });
    return Response.json({ error: "SERVICE_POLICY_DIAGNOSTICS_FAILED" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { action?: string; product?: string; enabled?: boolean };
  try {
    body = await request.json() as { action?: string; product?: string; enabled?: boolean };
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const pricing = await brazilPricing();
    const popular = findPopularRows(pricing);

    if (body.action === "approve_recommended") {
      const available = popular.filter((item) => item.providerAvailable && item.product && !item.complianceBlockReason);
      const products = available.map((item) => item.product as string);
      const { data: existing, error: existingError } = await supabase
        .from("service_policies")
        .select("product,risk_category")
        .eq("provider", "smspool")
        .in("product", products);
      if (existingError) throw existingError;
      const existingRisk = new Map((existing ?? []).map((row: { product: string; risk_category: string }) => [String(row.product), row.risk_category]));

      const safe = available.filter((item) => {
        const risk = existingRisk.get(item.product as string);
        return !risk || !isRiskCategoryBlocked(risk);
      });

      if (safe.length) {
        const { error } = await supabase.from("service_policies").upsert(
          safe.map((item) => ({
            provider: "smspool",
            product: item.product,
            enabled: true,
            risk_category: existingRisk.get(item.product as string) ?? "standard",
            notes: `Aprovado pelo admin a partir do catálogo Brasil: ${item.serviceName}`,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "provider,product" },
        );
        if (error) throw error;
      }

      await supabase.from("audit_logs").insert({
        actor_type: "admin",
        action: "smspool_popular_services_approved",
        entity_type: "service_policy",
        metadata: { products: safe.map((item) => item.product), country: "BR" },
      });

      return Response.json({ ok: true, changed: safe.length, services: await snapshot() });
    }

    if (body.action === "set" && body.product && typeof body.enabled === "boolean") {
      const current = popular.find((item) => item.product === body.product);
      if (body.enabled && (!current || !current.providerAvailable)) {
        return Response.json({ error: "SERVICE_NOT_AVAILABLE_IN_BRAZIL_CATALOG" }, { status: 409 });
      }
      if (body.enabled && current?.serviceName) {
        const reason = getSmsPoolCatalogBlockReason(current.serviceName);
        if (reason) return Response.json({ error: `SERVICE_BLOCKED_BY_COMPLIANCE_POLICY:${reason}` }, { status: 403 });
      }

      const { data: existing, error: existingError } = await supabase
        .from("service_policies")
        .select("risk_category")
        .eq("provider", "smspool")
        .eq("product", body.product)
        .maybeSingle();
      if (existingError) throw existingError;
      if (body.enabled && existing?.risk_category && isRiskCategoryBlocked(existing.risk_category)) {
        return Response.json({ error: "SERVICE_BLOCKED_BY_RISK_CATEGORY" }, { status: 403 });
      }

      const { error } = await supabase.from("service_policies").upsert({
        provider: "smspool",
        product: body.product,
        enabled: body.enabled,
        risk_category: existing?.risk_category ?? "standard",
        notes: `Alterado pelo admin no gerenciador de serviços populares (${body.enabled ? "aprovado" : "desativado"}).`,
        updated_at: new Date().toISOString(),
      }, { onConflict: "provider,product" });
      if (error) throw error;

      await supabase.from("audit_logs").insert({
        actor_type: "admin",
        action: body.enabled ? "smspool_service_approved" : "smspool_service_disabled",
        entity_type: "service_policy",
        entity_id: body.product,
        metadata: { country: "BR", serviceName: current?.serviceName ?? null },
      });

      return Response.json({ ok: true, services: await snapshot() });
    }

    return Response.json({ error: "INVALID_ACTION" }, { status: 400 });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "SERVICE_POLICY_UPDATE_FAILED";
    console.error("[smspool-service-policies] POST failed", { message });
    return Response.json({ error: "SERVICE_POLICY_UPDATE_FAILED" }, { status: 502 });
  }
}
