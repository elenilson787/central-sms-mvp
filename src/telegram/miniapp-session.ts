import { getSupabaseAdmin } from "@/src/db/supabase-server";
import type { TelegramMiniAppUser } from "@/src/telegram/miniapp-auth";

export type MiniAppSession = {
  user: {
    id: string;
    telegramUserId: number;
    username?: string;
    firstName: string;
    lastName?: string;
  };
  wallet: {
    balanceCents: number;
    currency: string;
  };
  recentActivations: Array<{
    id: string;
    kind: "ONE_TIME_SMS" | "TEMPORARY_HOSTING";
    country: string;
    product: string;
    phone?: string;
    status: string;
    salePriceCents: number;
    createdAt: string;
    updatedAt?: string;
    expiresAt?: string;
    smsCode?: string;
    smsText?: string;
  }>;
};

export async function getOrCreateMiniAppSession(telegramUser: TelegramMiniAppUser): Promise<MiniAppSession> {
  const supabase = getSupabaseAdmin();

  const { data: appUser, error: userError } = await supabase
    .from("app_users")
    .upsert(
      {
        telegram_user_id: telegramUser.id,
        username: telegramUser.username ?? null,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "telegram_user_id" },
    )
    .select("id,telegram_user_id,username,first_name,last_name,status")
    .single();

  if (userError || !appUser) throw new Error(`MINIAPP_USER_UPSERT_FAILED:${userError?.message ?? "unknown"}`);
  if (appUser.status !== "active") throw new Error("MINIAPP_USER_BLOCKED");

  let { data: wallet, error: walletReadError } = await supabase
    .from("wallets")
    .select("balance_cents,currency")
    .eq("user_id", appUser.id)
    .maybeSingle();

  if (walletReadError) throw new Error(`MINIAPP_WALLET_READ_FAILED:${walletReadError.message}`);

  if (!wallet) {
    const { data: createdWallet, error: walletCreateError } = await supabase
      .from("wallets")
      .insert({ user_id: appUser.id, balance_cents: 0, currency: "BRL" })
      .select("balance_cents,currency")
      .single();

    if (walletCreateError || !createdWallet) {
      const retry = await supabase
        .from("wallets")
        .select("balance_cents,currency")
        .eq("user_id", appUser.id)
        .single();
      if (retry.error || !retry.data) {
        throw new Error(`MINIAPP_WALLET_CREATE_FAILED:${walletCreateError?.message ?? retry.error?.message ?? "unknown"}`);
      }
      wallet = retry.data;
    } else {
      wallet = createdWallet;
    }
  }

  const { data: activations, error: activationsError } = await supabase
    .from("activations")
    .select("id,kind,country,product,phone,status,sale_price_cents,created_at,updated_at,expires_at,sms_code,sms_text")
    .eq("user_id", appUser.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (activationsError) throw new Error(`MINIAPP_ACTIVATIONS_READ_FAILED:${activationsError.message}`);

  return {
    user: {
      id: appUser.id,
      telegramUserId: Number(appUser.telegram_user_id),
      username: appUser.username ?? undefined,
      firstName: appUser.first_name ?? telegramUser.first_name,
      lastName: appUser.last_name ?? undefined,
    },
    wallet: {
      balanceCents: Number(wallet.balance_cents),
      currency: wallet.currency,
    },
    recentActivations: (activations ?? []).map((activation) => ({
      id: activation.id,
      kind: activation.kind,
      country: activation.country,
      product: activation.product,
      phone: activation.phone ?? undefined,
      status: activation.status,
      salePriceCents: Number(activation.sale_price_cents),
      createdAt: activation.created_at,
      updatedAt: activation.updated_at ?? undefined,
      expiresAt: activation.expires_at ?? undefined,
      smsCode: activation.sms_code ?? undefined,
      smsText: activation.sms_text ?? undefined,
    })),
  };
}
