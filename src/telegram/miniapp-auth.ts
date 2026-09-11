export type TelegramMiniAppUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
};

export type ValidatedMiniAppInitData = {
  user: TelegramMiniAppUser;
  authDate: number;
  queryId?: string;
  startParam?: string;
};

function hexToBytes(hex: string): Uint8Array {
  if (!/^[a-f0-9]{64}$/i.test(hex)) throw new Error("TELEGRAM_INIT_DATA_HASH_INVALID");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) out[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  return out;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function hmacSha256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    asArrayBuffer(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const encodedMessage = new TextEncoder().encode(message);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, asArrayBuffer(encodedMessage));
  return new Uint8Array(signature);
}

export async function validateTelegramMiniAppInitData(
  initData: string,
  botToken: string,
  options: { maxAgeSeconds?: number; nowSeconds?: number } = {},
): Promise<ValidatedMiniAppInitData> {
  if (!initData) throw new Error("TELEGRAM_INIT_DATA_MISSING");
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN_NOT_CONFIGURED");

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash) throw new Error("TELEGRAM_INIT_DATA_HASH_MISSING");

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = await hmacSha256(new TextEncoder().encode("WebAppData"), botToken);
  const calculatedHash = await hmacSha256(secretKey, dataCheckString);
  const receivedHashBytes = hexToBytes(receivedHash);

  if (!constantTimeEqual(calculatedHash, receivedHashBytes)) {
    throw new Error("TELEGRAM_INIT_DATA_SIGNATURE_INVALID");
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isInteger(authDate) || authDate <= 0) throw new Error("TELEGRAM_INIT_DATA_AUTH_DATE_INVALID");

  const maxAgeSeconds = options.maxAgeSeconds ?? 3600;
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (authDate > nowSeconds + 60 || nowSeconds - authDate > maxAgeSeconds) {
    throw new Error("TELEGRAM_INIT_DATA_EXPIRED");
  }

  const rawUser = params.get("user");
  if (!rawUser) throw new Error("TELEGRAM_INIT_DATA_USER_MISSING");

  let user: TelegramMiniAppUser;
  try {
    user = JSON.parse(rawUser) as TelegramMiniAppUser;
  } catch {
    throw new Error("TELEGRAM_INIT_DATA_USER_INVALID");
  }

  if (!Number.isSafeInteger(user.id) || user.id <= 0 || typeof user.first_name !== "string") {
    throw new Error("TELEGRAM_INIT_DATA_USER_INVALID");
  }

  return {
    user,
    authDate,
    queryId: params.get("query_id") ?? undefined,
    startParam: params.get("start_param") ?? undefined,
  };
}
