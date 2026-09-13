import { env, requireSmsPoolPurchaseConfiguration } from "@/src/config/env";

const SMSPOOL_API_BASE = "https://api.smspool.net";

type Scalar = string | number | boolean | undefined | null;

type RequestOptions = {
  method?: "GET" | "POST";
  fields?: Record<string, Scalar>;
  authenticated?: boolean;
  optionalKey?: boolean;
};

export type SmsPoolCountry = {
  ID: number | string;
  name: string;
  short_name: string;
  region?: string;
};

export type SmsPoolService = {
  ID: number | string;
  name: string;
  favourite?: number;
};

export type SmsPoolPricing = {
  service: number | string;
  service_name: string;
  country: number | string;
  country_name: string;
  short_name: string;
  pool: number | string;
  price: string | number;
};

export type SmsPoolPrice = {
  pool?: number | string;
  high_price?: string | number;
  price: string | number;
  success_rate?: number;
};

export type SmsPoolStock = {
  success: number;
  amount: number;
  message?: string;
};

export type SmsPoolPurchase = {
  success: number;
  number: string | number;
  cc?: string | number;
  phonenumber?: string | number;
  order_id: string;
  country: string;
  service: string;
  pool?: number | string;
  expires_in?: number;
  expiration?: number;
  message?: string;
  cost: string | number;
  cost_in_cents?: number;
};

export type SmsPoolCheck = {
  status: number;
  resend?: number;
  expiration?: number;
  time_left?: number;
  sms?: string;
  full_sms?: string;
  message?: string;
};

export type SmsPoolCancel = {
  success: number;
  message?: string;
};

function requireApiKey() {
  if (!env.smsPoolApiKey) throw new Error("SMSPOOL_API_KEY_NOT_CONFIGURED");
  return env.smsPoolApiKey;
}

function stringifyProviderError(value: unknown) {
  if (typeof value === "string") return value.slice(0, 500);
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return String(value).slice(0, 500);
  }
}

async function smsPoolRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "POST";
  const key = options.authenticated ? requireApiKey() : env.smsPoolApiKey;
  const fields = new URLSearchParams();

  for (const [name, value] of Object.entries(options.fields ?? {})) {
    if (value !== undefined && value !== null && value !== "") fields.set(name, String(value));
  }
  if ((options.authenticated || options.optionalKey) && key) fields.set("key", key);

  const url = new URL(`${SMSPOOL_API_BASE}${path}`);
  let body: URLSearchParams | undefined;
  if (method === "GET") {
    for (const [name, value] of fields.entries()) {
      if (name !== "key") url.searchParams.set(name, value);
    }
  } else {
    body = fields;
  }

  const headers: Record<string, string> = { accept: "application/json" };
  if (key) headers.authorization = `Bearer ${key}`;

  const response = await fetch(url, { method, headers, body });
  const text = await response.text();
  let payload: unknown = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }

  const providerFailure = payload && typeof payload === "object" && "success" in payload && (payload as { success?: unknown }).success === 0;
  if (!response.ok || providerFailure) {
    throw new Error(`SMSPOOL_API_ERROR:${response.status}:${stringifyProviderError(payload)}`);
  }

  return payload as T;
}

export async function retrieveSmsPoolCountries() {
  return smsPoolRequest<SmsPoolCountry[]>("/country/retrieve_all", { method: "GET" });
}

export async function retrieveSmsPoolServices(country?: string | number) {
  return smsPoolRequest<SmsPoolService[]>("/service/retrieve_all", {
    method: "GET",
    fields: { country },
  });
}

export async function retrieveSmsPoolPricing(input: {
  country?: string | number;
  service?: string | number;
  pool?: string | number;
  maxPrice?: number;
} = {}) {
  return smsPoolRequest<SmsPoolPricing[]>("/request/pricing", {
    optionalKey: true,
    fields: {
      country: input.country,
      service: input.service,
      pool: input.pool,
      max_price: input.maxPrice,
    },
  });
}

export async function retrieveSmsPoolPrice(input: {
  country: string | number;
  service: string | number;
  pool?: string | number;
}) {
  return smsPoolRequest<SmsPoolPrice>("/request/price", {
    optionalKey: true,
    fields: {
      country: input.country,
      service: input.service,
      pool: input.pool,
    },
  });
}

export async function retrieveSmsPoolStock(input: {
  country: string | number;
  service: string | number;
  pool?: string | number;
}) {
  return smsPoolRequest<SmsPoolStock>("/sms/stock", {
    authenticated: true,
    fields: {
      country: input.country,
      service: input.service,
      pool: input.pool,
    },
  });
}

export async function retrieveSmsPoolBalance() {
  return smsPoolRequest<{ balance: string | number }>("/request/balance", { authenticated: true });
}

export async function purchaseSmsPoolNumber(input: {
  country: string | number;
  service: string | number;
  pool?: string | number;
  maxPrice?: number;
  pricingOption?: 0 | 1;
}) {
  requireSmsPoolPurchaseConfiguration();
  return smsPoolRequest<SmsPoolPurchase>("/purchase/sms", {
    authenticated: true,
    fields: {
      country: input.country,
      service: input.service,
      pool: input.pool,
      max_price: input.maxPrice,
      pricing_option: input.pricingOption ?? 1,
      quantity: 1,
      activation_type: "SMS",
      create_token: 0,
    },
  });
}

export async function checkSmsPoolOrder(orderId: string) {
  return smsPoolRequest<SmsPoolCheck>("/sms/check", {
    authenticated: true,
    fields: { orderid: orderId },
  });
}

export async function cancelSmsPoolOrder(orderId: string) {
  return smsPoolRequest<SmsPoolCancel>("/sms/cancel", {
    authenticated: true,
    fields: { orderid: orderId },
  });
}
