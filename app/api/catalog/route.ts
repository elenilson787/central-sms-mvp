import { getApprovedProducts } from "@/src/compliance/policy";
import { env } from "@/src/config/env";
import { FiveSimProvider } from "@/src/providers/fivesim/adapter";
import { consumeRateLimit } from "@/src/security/rate-limit";

function hasAdminAccess(request: Request) {
  if (!env.adminApiToken) return false;
  return request.headers.get("authorization") === `Bearer ${env.adminApiToken}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const country = (url.searchParams.get("country") ?? "brazil").toLowerCase();
  const operator = (url.searchParams.get("operator") ?? "any").toLowerCase();
  const raw = url.searchParams.get("raw") === "1";
  const provider = new FiveSimProvider();

  try {
    if (raw && !hasAdminAccess(request)) {
      return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    if (!raw) {
      const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      const clientKey = forwarded || request.headers.get("x-real-ip") || "unknown";
      const allowed = await consumeRateLimit({ scope: "public-catalog", key: clientKey, limit: 60, windowSeconds: 60 });
      if (!allowed) return Response.json({ error: "RATE_LIMITED" }, { status: 429 });
    }
    const offers = await provider.listOffers(country, operator);
    if (raw) {
      return Response.json({ provider: provider.name, country, operator, mode: "raw-admin", offers });
    }

    const approved = await getApprovedProducts(provider.name);
    const publicOffers = offers.filter((offer) => approved.has(offer.product.toLowerCase()));
    return Response.json({ provider: provider.name, country, operator, mode: "approved-public", offers: publicOffers });
  } catch (error) {
    return Response.json({ error: String(error instanceof Error ? error.message : error) }, { status: 502 });
  }
}
