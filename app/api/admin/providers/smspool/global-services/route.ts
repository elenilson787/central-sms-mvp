import { getSmsPoolCatalogBlockReason } from "@/src/compliance/smspool-catalog";
import { getSupabaseAdmin } from "@/src/db/supabase-server";
import { retrieveSmsPoolPricing, type SmsPoolPricing } from "@/src/providers/smspool/client";
import { isAdminRequest } from "@/src/security/admin-auth";

type ServiceCountry = {
  countryId: string;
  countryCode: string;
  countryName: string;
  minProviderPrice: number;
  poolCount: number;
};

type GlobalService = {
  product: string;
  label: string;
  countries: ServiceCountry[];
  countryCount: number;
  poolCount: number;
  minProviderPrice: number;
  enabled: boolean;
  riskCategory: string | null;
  complianceBlockReason: string | null;
  saleEligible: boolean;
};

function numeric(value: string | number | undefined | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function policyMap() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("service_policies")
    .select("product,enabled,risk_category")
    .eq("provider", "smspool");

  if (error) throw error;

  return new Map(
    (data ?? []).map((row: { product: string; enabled: boolean; risk_category: string | null }) => [
      String(row.product),
      row,
    ]),
  );
}

function aggregate(pricing: SmsPoolPricing[], policies: Map<string, { product: string; enabled: boolean; risk_category: string | null }>) {
  const serviceMap = new Map<string, { label: string; countries: Map<string, ServiceCountry> }>();

  for (const row of pricing) {
    const product = String(row.service);
    const label = String(row.service_name ?? product);
    const price = numeric(row.price);
    if (!product || price <= 0) continue;

    const countryId = String(row.country);
    const countryCode = String(row.short_name ?? "").toUpperCase();
    const countryName = String(row.country_name ?? countryCode ?? countryId);
    const key = product;

    let service = serviceMap.get(key);
    if (!service) {
      service = { label, countries: new Map() };
      serviceMap.set(key, service);
    }

    const country = service.countries.get(countryId);
    if (!country) {
      service.countries.set(countryId, {
        countryId,
        countryCode,
        countryName,
        minProviderPrice: price,
        poolCount: 1,
      });
    } else {
      country.minProviderPrice = Math.min(country.minProviderPrice, price);
      country.poolCount += 1;
    }
  }

  return [...serviceMap.entries()]
    .map(([product, value]) => {
      const policy = policies.get(product);
      const complianceBlockReason = getSmsPoolCatalogBlockReason(value.label);
      const countries = [...value.countries.values()].sort((a, b) => a.countryName.localeCompare(b.countryName, "pt-BR"));
      const poolCount = countries.reduce((sum, country) => sum + country.poolCount, 0);

      return {
        product,
        label: value.label,
        countries,
        countryCount: countries.length,
        poolCount,
        minProviderPrice: Math.min(...countries.map((country) => country.minProviderPrice)),
        enabled: Boolean(policy?.enabled),
        riskCategory: policy?.risk_category ?? null,
        complianceBlockReason,
        saleEligible: !complianceBlockReason,
      } satisfies GlobalService;
    })
    .sort((a, b) => normalize(a.label).localeCompare(normalize(b.label), "pt-BR"));
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    const [pricing, policies] = await Promise.all([
      retrieveSmsPoolPricing(),
      policyMap(),
    ]);

    const services = aggregate(pricing, policies);

    return Response.json({
      ok: true,
      provider: "smspool",
      generatedAt: new Date().toISOString(),
      source: "SMSPool /request/pricing",
      totalServices: services.length,
      totalCountryEntries: services.reduce((sum, service) => sum + service.countryCount, 0),
      services,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "SMSPOOL_GLOBAL_CATALOG_FAILED";
    console.error("[smspool-global-services] GET failed", { message });
    return Response.json({ error: "SMSPOOL_GLOBAL_CATALOG_FAILED" }, { status: 502 });
  }
}
