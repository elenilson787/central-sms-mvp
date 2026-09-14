import { logAudit } from "@/src/audit/log";
import { assertServiceAllowed } from "@/src/compliance/policy";
import { requireSmsPoolPurchaseConfiguration } from "@/src/config/env";
import { getSupabaseAdmin } from "@/src/db/supabase-server";
import { quoteSmsPoolCatalogOffer } from "@/src/providers/smspool/catalog";
import { checkSmsPoolOrder, purchaseSmsPoolNumber } from "@/src/providers/smspool/client";
import type { NumberKind } from "@/src/providers/types";
import { applyWalletTransaction, getWalletBalanceCents } from "@/src/wallet/service";

type PurchaseInput = {
  userId: string;
  provider?: string;
  country: string;
  operator?: string;
  product: string;
  kind: NumberKind;
  idempotencyKey?: string;
  maxSalePriceCents?: number;
};

type ActivationRow = Record<string, unknown> & {
  id: string;
  user_id: string;
  status: string;
  external_activation_id?: string | null;
};

function safeErrorMessage(error: unknown) {
  const value = error instanceof Error ? error.message : String(error);
  return value.slice(0, 500);
}

async function findActivationByIdempotencyKey(idempotencyKey: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("activations")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  return data as ActivationRow | null;
}

async function updateActivation(id: string, values: Record<string, unknown>) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("activations")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as ActivationRow;
}

async function bestEffortAudit(input: Parameters<typeof logAudit>[0]) {
  try {
    await logAudit(input);
  } catch (error) {
    console.error("[activation-audit] failed", { message: safeErrorMessage(error) });
  }
}

function resolvePhone(purchase: { phonenumber?: string | number; number: string | number; cc?: string | number }) {
  const raw = purchase.phonenumber ?? purchase.number;
  const value = String(raw ?? "").trim();
  if (!value) throw new Error("SMSPOOL_PURCHASE_PHONE_MISSING");
  const cc = String(purchase.cc ?? "").trim();
  if (value.startsWith("+") || !cc) return value;
  return `+${cc}${value}`.replace(/\+\+/, "+");
}

function resolveExpiresAt(purchase: { expires_in?: number; expiration?: number }) {
  const expiresIn = Number(purchase.expires_in);
  if (Number.isFinite(expiresIn) && expiresIn > 0 && expiresIn <= 7 * 24 * 60 * 60) {
    return new Date(Date.now() + expiresIn * 1000).toISOString();
  }

  const expiration = Number(purchase.expiration);
  if (Number.isFinite(expiration) && expiration > 1_000_000_000) {
    const millis = expiration > 10_000_000_000 ? expiration : expiration * 1000;
    const date = new Date(millis);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

export async function purchaseActivation(input: PurchaseInput): Promise<Record<string, unknown>> {
  const provider = input.provider ?? "smspool";
  if (provider !== "smspool") throw new Error("PROVIDER_NOT_SUPPORTED_FOR_PURCHASE");
  if (input.kind !== "ONE_TIME_SMS") throw new Error("RENTAL_PURCHASE_NOT_IMPLEMENTED");
  if (!input.idempotencyKey?.trim()) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  if (!input.operator?.trim()) throw new Error("SMSPOOL_POOL_REQUIRED");

  // Hard commercial gate. With either flag disabled, execution stops before any
  // wallet or provider mutation happens.
  requireSmsPoolPurchaseConfiguration();

  const idempotencyKey = input.idempotencyKey.trim();
  const existing = await findActivationByIdempotencyKey(idempotencyKey);
  if (existing) return existing;

  const offerId = `smspool:${input.country}:${input.product}:${input.operator}`;
  const quote = await quoteSmsPoolCatalogOffer(offerId);
  if (!quote.pricingConfigured || quote.salePriceCents === null) throw new Error("PRICING_NOT_CONFIGURED");
  if (quote.stock < 1) throw new Error("OFFER_NOT_AVAILABLE");

  if (input.maxSalePriceCents !== undefined) {
    const maxSalePriceCents = Math.trunc(Number(input.maxSalePriceCents));
    if (!Number.isFinite(maxSalePriceCents) || maxSalePriceCents < 0) {
      throw new Error("MAX_SALE_PRICE_INVALID");
    }
    if (quote.salePriceCents > maxSalePriceCents) {
      throw new Error("PRICE_CHANGED_REVIEW_REQUIRED");
    }
  }

  // Catalog filtering protects discovery; this database policy is the second,
  // explicit allow-list required before a real sale can execute.
  await assertServiceAllowed("smspool", quote.offer.product);

  const walletBalanceCents = await getWalletBalanceCents(input.userId);
  if (walletBalanceCents < quote.salePriceCents) throw new Error("INSUFFICIENT_BALANCE");

  const supabase = getSupabaseAdmin();
  const { data: inserted, error: insertError } = await supabase
    .from("activations")
    .insert({
      user_id: input.userId,
      provider: "smspool",
      external_activation_id: null,
      idempotency_key: idempotencyKey,
      country: quote.offer.country,
      operator: quote.offer.operator,
      product: quote.offer.product,
      kind: "ONE_TIME_SMS",
      phone: null,
      provider_cost: quote.providerPrice,
      provider_currency: quote.providerCurrency,
      sale_price_cents: quote.salePriceCents,
      status: "creating",
      last_error: null,
    })
    .select("*")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const raced = await findActivationByIdempotencyKey(idempotencyKey);
      if (raced) return raced;
    }
    throw insertError;
  }

  const activation = inserted as ActivationRow;
  const purchaseReference = `activation:${activation.id}`;
  let walletDebited = false;

  try {
    await applyWalletTransaction({
      userId: input.userId,
      type: "purchase",
      amountCents: -quote.salePriceCents,
      referenceId: purchaseReference,
      metadata: {
        activationId: activation.id,
        provider: "smspool",
        offerId,
        maxSalePriceCents: input.maxSalePriceCents ?? null,
      },
    });
    walletDebited = true;
  } catch (error) {
    await updateActivation(activation.id, {
      status: "failed",
      last_error: safeErrorMessage(error),
    });
    throw error;
  }

  try {
    const providerPurchase = await purchaseSmsPoolNumber({
      country: quote.offer.countryId,
      service: quote.offer.product,
      pool: quote.offer.operator,
      // Lock the provider-side spend to the server quote. If the provider price
      // moved upward meanwhile, the order must fail instead of silently eroding margin.
      maxPrice: quote.providerPrice,
      pricingOption: 1,
    });

    const persisted = await updateActivation(activation.id, {
      external_activation_id: String(providerPurchase.order_id),
      phone: resolvePhone(providerPurchase),
      provider_cost: Number(providerPurchase.cost),
      provider_currency: quote.providerCurrency,
      status: "waiting_sms",
      expires_at: resolveExpiresAt(providerPurchase),
      last_error: null,
    });

    await bestEffortAudit({
      actorType: "system",
      actorId: input.userId,
      action: "activation.purchase_succeeded",
      entityType: "activation",
      entityId: activation.id,
      metadata: {
        provider: "smspool",
        product: quote.offer.product,
        country: quote.offer.country,
        salePriceCents: quote.salePriceCents,
      },
    });

    return persisted;
  } catch (error) {
    const message = safeErrorMessage(error);
    const providerExplicitlyRejected = message.startsWith("SMSPOOL_API_ERROR:");

    if (providerExplicitlyRejected && walletDebited) {
      await applyWalletTransaction({
        userId: input.userId,
        type: "refund",
        amountCents: quote.salePriceCents,
        referenceId: `${purchaseReference}:provider-rejected`,
        metadata: {
          activationId: activation.id,
          provider: "smspool",
          reason: "provider_rejected_purchase",
        },
      });

      await updateActivation(activation.id, {
        status: "refunded",
        last_error: message,
      });
    } else {
      // A network timeout or a persistence failure can happen after the provider
      // accepted the order. Do not retry the provider mutation and do not refund
      // automatically: the idempotency row stays as the reconciliation anchor.
      await updateActivation(activation.id, {
        status: "failed",
        last_error: `PROVIDER_RESULT_UNKNOWN:${message}`.slice(0, 500),
      }).catch(() => undefined);
    }

    await bestEffortAudit({
      actorType: "system",
      actorId: input.userId,
      action: providerExplicitlyRejected
        ? "activation.purchase_rejected_refunded"
        : "activation.purchase_requires_reconciliation",
      entityType: "activation",
      entityId: activation.id,
      metadata: { provider: "smspool" },
    });

    throw error;
  }
}

export async function refreshWaitingActivations(limit = 25): Promise<Array<Record<string, unknown>>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("activations")
    .select("*")
    .eq("provider", "smspool")
    .in("status", ["number_received", "waiting_sms"])
    .not("external_activation_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(Math.max(1, Math.min(100, Math.trunc(limit))));
  if (error) throw error;

  const refreshed: Array<Record<string, unknown>> = [];
  for (const row of (data ?? []) as ActivationRow[]) {
    try {
      const status = await checkSmsPoolOrder(String(row.external_activation_id));
      const smsCode = String(status.sms ?? "").trim();
      const smsText = String(status.full_sms ?? status.sms ?? "").trim();
      if (!smsCode && !smsText) continue;

      const dedupeKey = `smspool:${row.external_activation_id}:${smsCode}:${smsText}`.slice(0, 500);
      const smsInsert = await supabase.from("activation_sms").upsert({
        activation_id: row.id,
        provider_sms_id: null,
        dedupe_key: dedupeKey,
        sender: null,
        sms_text: smsText || null,
        sms_code: smsCode || null,
        received_at: new Date().toISOString(),
      }, { onConflict: "activation_id,dedupe_key", ignoreDuplicates: true });
      if (smsInsert.error) throw smsInsert.error;

      const updated = await updateActivation(row.id, {
        status: "sms_received",
        sms_code: smsCode || null,
        sms_text: smsText || null,
      });
      refreshed.push(updated);
    } catch (refreshError) {
      console.error("[activation-refresh] failed", {
        activationId: row.id,
        message: safeErrorMessage(refreshError),
      });
    }
  }

  return refreshed;
}