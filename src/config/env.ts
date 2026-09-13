function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export const env = {
  appBaseUrl: optional("APP_BASE_URL"),
  purchasesEnabled: optional("PURCHASES_ENABLED") === "true",
  pixEnabled: optional("PIX_ENABLED") === "true",
  pixMinDepositCents: Number(optional("PIX_MIN_DEPOSIT_CENTS") ?? "500"),
  pixMaxDepositCents: Number(optional("PIX_MAX_DEPOSIT_CENTS") ?? "100000"),
  adminApiToken: optional("ADMIN_API_TOKEN"),
  cronSecret: optional("CRON_SECRET"),
  telegramBotToken: optional("TELEGRAM_BOT_TOKEN"),
  telegramWebhookSecret: optional("TELEGRAM_WEBHOOK_SECRET"),
  telegramMiniAppUrl: optional("TELEGRAM_MINI_APP_URL"),
  supabaseUrl: optional("SUPABASE_URL"),
  supabaseSecretKey: optional("SUPABASE_SECRET_KEY"),
  fiveSimToken: optional("FIVESIM_TOKEN"),
  fiveSimPriceCurrency: optional("FIVESIM_PRICE_CURRENCY") ?? "UNCONFIRMED",
  smsPoolApiKey: optional("SMSPOOL_API_KEY"),
  smsPoolCommercialApproved: optional("SMSPOOL_COMMERCIAL_APPROVED") === "true",
  smsPoolPriceCurrency: optional("SMSPOOL_PRICE_CURRENCY") ?? "USD",
  markupPercent: Number(optional("DEFAULT_MARKUP_PERCENT") ?? "35"),
  markupFixedBrlCents: Number(optional("DEFAULT_MARKUP_FIXED_BRL_CENTS") ?? "50"),
  minimumSalePriceBrlCents: Number(optional("MIN_SALE_PRICE_BRL_CENTS") ?? "99"),
  providerToBrlRate: optional("PROVIDER_TO_BRL_RATE") ? Number(optional("PROVIDER_TO_BRL_RATE")) : undefined,
  rentalLowCostMaxBrlCents: Number(optional("RENTAL_LOW_COST_MAX_BRL_CENTS") ?? "500"),
  rentalMidCostMaxBrlCents: Number(optional("RENTAL_MID_COST_MAX_BRL_CENTS") ?? "3000"),
  rentalLowMarkupPercent: Number(optional("RENTAL_LOW_MARKUP_PERCENT") ?? "35"),
  rentalLowMarkupFixedBrlCents: Number(optional("RENTAL_LOW_MARKUP_FIXED_BRL_CENTS") ?? "50"),
  rentalMidMarkupPercent: Number(optional("RENTAL_MID_MARKUP_PERCENT") ?? "25"),
  rentalMidMarkupFixedBrlCents: Number(optional("RENTAL_MID_MARKUP_FIXED_BRL_CENTS") ?? "100"),
  rentalHighMarkupPercent: Number(optional("RENTAL_HIGH_MARKUP_PERCENT") ?? "15"),
  rentalHighMarkupFixedBrlCents: Number(optional("RENTAL_HIGH_MARKUP_FIXED_BRL_CENTS") ?? "200"),
  mercadoPagoAccessToken: optional("MERCADO_PAGO_ACCESS_TOKEN"),
  mercadoPagoWebhookSecret: optional("MERCADO_PAGO_WEBHOOK_SECRET"),
  mercadoPagoTestMode: optional("MERCADO_PAGO_TEST_MODE") === "true",
};

export function requirePurchaseConfiguration() {
  if (!env.purchasesEnabled) throw new Error("PURCHASES_DISABLED");
  throw new Error("LIVE_PROVIDER_OPERATIONS_NOT_ENABLED_IN_BOOTSTRAP");
}

export function requireSmsPoolPurchaseConfiguration() {
  if (!env.purchasesEnabled) throw new Error("PURCHASES_DISABLED");
  if (!env.smsPoolCommercialApproved) throw new Error("SMSPOOL_COMMERCIAL_APPROVAL_REQUIRED");
  if (!env.smsPoolApiKey) throw new Error("SMSPOOL_API_KEY_NOT_CONFIGURED");
  return env.smsPoolApiKey;
}
