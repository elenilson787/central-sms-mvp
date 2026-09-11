import type { NumberKind } from "@/src/providers/types";

export async function purchaseActivation(_input: {
  userId: string;
  provider?: string;
  country: string;
  operator?: string;
  product: string;
  kind: NumberKind;
  idempotencyKey?: string;
}): Promise<Record<string, unknown>> {
  throw new Error("PURCHASES_DISABLED");
}

export async function refreshWaitingActivations(_limit = 25): Promise<Array<Record<string, unknown>>> {
  return [];
}
