import { purchaseActivation } from "@/src/activations/service";
import { assertServiceAllowed, isRiskCategoryBlocked } from "@/src/compliance/policy";
import { env } from "@/src/config/env";
import { getSupabaseAdmin } from "@/src/db/supabase-server";
import { listSmsPoolLiveCatalog, quoteSmsPoolCatalogOffer } from "@/src/providers/smspool/catalog";
import { isAdminRequest } from "@/src/security/admin-auth";
import { getWalletBalanceCents } from "@/src/wallet/service";

const TEST_SERVICE_LABEL = "Discord";
const TEST_COUNTRY_SELECTOR = "BR";
const PURCHASE_CONFIRMATION = "BUY_ONE_REAL_DISCORD_BR";
const POLICY_CONFIRMATION = "APPROVE_DISCORD_BR_STANDARD";

type RequestBody = {
  action?: "preview" | "approve_service" | "execute";
  userId?: string;
  idempotencyKey?: string;
  confirmation?: string;
};

function safeError(error: unknown) {
  return String(error instanceof Error ? error.message : error).slice(0, 500);
}

async function resolveDiscordBrazilOffer() {
  const catalog = await listSmsPoolLiveCatalog(TEST_COUNTRY_SELECTOR);
  const expected = TEST_SERVICE_LABEL.toLowerCase();
  const offer = catalog.offers.find((item) => item.label.trim().toLowerCase() === expected)
    ?? catalog.offers.find((item) => item.label.toLowerCase().includes(expected));
  if (!offer) throw new Error("DISCORD_BR_OFFER_NOT_FOUND");

  const quote = await quoteSmsPoolCatalogOffer(offer.id);
  return { offer: quote.offer, quote };
}

async function buildPreview(userId: string) {
  const [{ offer, quote }, walletBalanceCents] = await Promise.all([
    resolveDiscordBrazilOffer(),
    getWalletBalanceCents(userId),
  ]);

  let serviceAllowed = true;
  let policyBlockReason: string | null = null;
  try {
    await assertServiceAllowed("smspool", offer.product);
  } catch (error) {
    serviceAllowed = false;
    policyBlockReason = safeError(error);
  }

  const salePriceCents = quote.salePriceCents;
  const hasPrice = quote.pricingConfigured && salePriceCents !== null;
  const hasStock = quote.stock > 0;
  const canAfford = salePriceCents !== null && walletBalanceCents >= salePriceCents;
  const safetyReady = Boolean(
    env.purchasesEnabled
    && env.smsPoolCommercialApproved
    && env.smsPoolApiKey,
  );

  return {
    offer: {
      id: offer.id,
      label: offer.label,
      country: offer.country,
      countryId: offer.countryId,
      countryName: offer.countryName,
      operator: offer.operator,
      product: offer.product,
      providerPrice: quote.providerPrice,
      providerCurrency: quote.providerCurrency,
    },
    price: {
      salePriceCents,
      currency: "BRL" as const,
    },
    stock: quote.stock,
    successRate: quote.successRate ?? null,
    walletBalanceCents,
    projectedBalanceCents: salePriceCents === null ? null : walletBalanceCents - salePriceCents,
    policy: {
      serviceAllowed,
      blockReason: policyBlockReason,
    },
    safety: {
      purchasesEnabled: env.purchasesEnabled,
      commercialApproved: env.smsPoolCommercialApproved,
      apiConfigured: Boolean(env.smsPoolApiKey),
    },
    canExecute: Boolean(safetyReady && serviceAllowed && hasPrice && hasStock && canAfford),
    blockers: [
      !env.purchasesEnabled ? "PURCHASES_DISABLED" : null,
      !env.smsPoolCommercialApproved ? "SMSPOOL_COMMERCIAL_APPROVAL_REQUIRED" : null,
      !env.smsPoolApiKey ? "SMSPOOL_API_KEY_NOT_CONFIGURED" : null,
      !serviceAllowed ? policyBlockReason ?? "SERVICE_NOT_APPROVED_FOR_SALE" : null,
      !hasPrice ? "PRICING_NOT_CONFIGURED" : null,
      !hasStock ? "OFFER_NOT_AVAILABLE" : null,
      hasPrice && !canAfford ? "INSUFFICIENT_BALANCE" : null,
    ].filter(Boolean),
  };
}

async function approveDiscordBrazilService() {
  const { offer } = await resolveDiscordBrazilOffer();
  const supabase = getSupabaseAdmin();
  const existing = await supabase
    .from("service_policies")
    .select("id,enabled,risk_category,notes")
    .eq("provider", "smspool")
    .eq("product", offer.product)
    .maybeSingle();

  if (existing.error) throw existing.error;

  if (existing.data) {
    const riskCategory = String(existing.data.risk_category ?? "");
    if (isRiskCategoryBlocked(riskCategory)) {
      throw new Error("SERVICE_BLOCKED_BY_COMPLIANCE_POLICY");
    }
    if (riskCategory && riskCategory !== "standard") {
      throw new Error("EXISTING_SERVICE_POLICY_REQUIRES_MANUAL_REVIEW");
    }

    const update = await supabase
      .from("service_policies")
      .update({
        enabled: true,
        risk_category: "standard",
        notes: "Admin-approved for the controlled Discord/Brazil SMSPool test after written commercial approval.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.data.id)
      .select("provider,product,enabled,risk_category,notes")
      .single();

    if (update.error) throw update.error;
    return { offer, policy: update.data };
  }

  const insert = await supabase
    .from("service_policies")
    .insert({
      provider: "smspool",
      product: offer.product,
      enabled: true,
      risk_category: "standard",
      notes: "Admin-approved for the controlled Discord/Brazil SMSPool test after written commercial approval.",
    })
    .select("provider,product,enabled,risk_category,notes")
    .single();

  if (insert.error) throw insert.error;
  return { offer, policy: insert.data };
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: RequestBody;
  try {
    body = await request.json() as RequestBody;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const userId = String(body.userId ?? "").trim();
  if (!userId) return Response.json({ error: "user_id_required" }, { status: 400 });

  const action = body.action ?? "preview";
  if (action !== "preview" && action !== "approve_service" && action !== "execute") {
    return Response.json({ error: "invalid_action" }, { status: 400 });
  }

  try {
    if (action === "approve_service") {
      if (body.confirmation !== POLICY_CONFIRMATION) {
        return Response.json({ error: "explicit_policy_confirmation_required" }, { status: 400 });
      }

      const approved = await approveDiscordBrazilService();
      const preview = await buildPreview(userId);
      return Response.json({
        ok: true,
        mode: "policy_approved",
        approved,
        preview,
      });
    }

    const preview = await buildPreview(userId);

    if (action === "preview") {
      return Response.json({ ok: true, mode: "preview", preview });
    }

    if (body.confirmation !== PURCHASE_CONFIRMATION) {
      return Response.json({ error: "explicit_confirmation_required" }, { status: 400 });
    }

    const idempotencyKey = String(body.idempotencyKey ?? "").trim();
    if (!idempotencyKey) return Response.json({ error: "idempotency_key_required" }, { status: 400 });

    if (!preview.canExecute) {
      return Response.json({ ok: false, error: "test_purchase_not_ready", preview }, { status: 409 });
    }

    const activation = await purchaseActivation({
      userId,
      provider: "smspool",
      // purchaseActivation rebuilds the SMSPool offer id. It must receive the
      // provider's canonical numeric country id, not the public short code (BR).
      country: preview.offer.countryId,
      operator: preview.offer.operator,
      product: preview.offer.product,
      kind: "ONE_TIME_SMS",
      idempotencyKey,
    });

    return Response.json({
      ok: true,
      mode: "executed",
      activation,
      testedOffer: preview.offer,
    });
  } catch (error) {
    const message = safeError(error);
    const expected = [
      "PURCHASES_DISABLED",
      "SMSPOOL_COMMERCIAL_APPROVAL_REQUIRED",
      "SMSPOOL_API_KEY_NOT_CONFIGURED",
      "SERVICE_NOT_APPROVED_FOR_SALE",
      "SERVICE_BLOCKED_BY_COMPLIANCE_POLICY",
      "EXISTING_SERVICE_POLICY_REQUIRES_MANUAL_REVIEW",
      "OFFER_NOT_AVAILABLE",
      "INSUFFICIENT_BALANCE",
      "PRICING_NOT_CONFIGURED",
      "DISCORD_BR_OFFER_NOT_FOUND",
      "SMSPOOL_OFFER_NOT_FOUND",
    ].some((code) => message.includes(code));

    return Response.json({ ok: false, error: message }, { status: expected ? 409 : 502 });
  }
}
