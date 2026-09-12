import { env } from "@/src/config/env";

export type PaymentEnvironment = "test" | "production";

export function currentPaymentEnvironment(): PaymentEnvironment {
  return env.mercadoPagoTestMode ? "test" : "production";
}
