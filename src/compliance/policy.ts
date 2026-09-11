import { getSupabaseAdmin } from "@/src/db/supabase-server";

const HARD_BLOCKED_RISK_CATEGORIES = new Set([
  "banking",
  "payments",
  "crypto",
  "kyc_identity",
  "government",
  "telecom_carrier",
  "fraud_abuse",
]);

export function isRiskCategoryBlocked(riskCategory: string) {
  return HARD_BLOCKED_RISK_CATEGORIES.has(riskCategory);
}

export async function getApprovedProducts(provider: string): Promise<Set<string>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("service_policies")
    .select("product,risk_category")
    .eq("provider", provider)
    .eq("enabled", true);

  if (error) throw error;
  return new Set(
    (data ?? [])
      .filter((row: { product: string; risk_category: string }) => !isRiskCategoryBlocked(row.risk_category))
      .map((row: { product: string; risk_category: string }) => String(row.product).toLowerCase()),
  );
}

export async function assertServiceAllowed(provider: string, product: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("service_policies")
    .select("enabled,risk_category")
    .eq("provider", provider)
    .eq("product", product)
    .maybeSingle();

  if (error) throw error;
  if (!data?.enabled) throw new Error("SERVICE_NOT_APPROVED_FOR_SALE");
  if (isRiskCategoryBlocked(data.risk_category)) throw new Error("SERVICE_BLOCKED_BY_COMPLIANCE_POLICY");
}
