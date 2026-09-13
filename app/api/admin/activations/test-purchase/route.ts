import { purchaseActivation } from "@/src/activations/service";
import { assertServiceAllowed } from "@/src/compliance/policy";
import { env } from "@/src/config/env";
import { listSmsPoolLiveCatalog, quoteSmsPoolCatalogOffer } from "@/src/providers/smspool/catalog";
import { isAdminRequest } from "@/src/security/admin-auth";
import { getWalletBalanceCents } from "@/src/wallet/service";

const CONFIRMATION = "BUY_ONE_REAL_YOUTUBE_BR";

type RequestBody = {
  action?: "preview" | "execute";
  userId?: string;
  idempotencyKey?: string;
  confirmation?: string;
};

function safeError(error: unknown) {
  return String(error instanceof Error ? error.message : error).slice(0, 500);
}

async function resolveYouTubeBrazilOffer() {
  const catalog = await listSmsPoolLiveCatalog("BR");
  const offer = catalog.offers.find((item) => item.label.trim().toLowerCase() === "youtube")
    ?? catalog.offers.find((item) => item.label.toLowerCase().includes("youtube"));
  if (!offer) throw new Error("YOUTUBE_BR_OFFER_NOT_FOUND");

  const quote = await quoteSmsPoolCatalogOffer(offer.id);
  return { offer: quote.offer, quote };
}

async function buildPreview(userId: string) {
  const [{ offer, quote }, walletBalanceCents] = await Promise.all([
    resolveYouTubeBrazilOffer(),
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
  if (action !== "preview" && action !== "execute") {
    return Response.json({ error: "invalid_action" }, { status: 400 });
  }

  try {
    const preview = await buildPreview(userId);

    if (action === "preview") {
      return Response.json({ ok: true, mode: "preview", preview });
    }

    if (body.confirmation !== CONFIRMATION) {
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
      country: preview.offer.country,
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
      "OFFER_NOT_AVAILABLE",
      "INSUFFICIENT_BALANCE",
      "PRICING_NOT_CONFIGURED",
      "YOUTUBE_BR_OFFER_NOT_FOUND",
    ].some((code) => message.includes(code));

    return Response.json({ ok: false, error: message }, { status: expected ? 409 : 502 });
  }
}
