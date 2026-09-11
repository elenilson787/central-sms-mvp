type PixInput = {
  amountCents: number;
  description: string;
  payerEmail: string;
  documentType: "CPF" | "CNPJ";
  documentNumber: string;
  externalReference: string;
  idempotencyKey: string;
};

/**
 * Payment integration boundary for the repository bootstrap.
 * Live PIX creation is intentionally disabled until gateway credentials,
 * webhook verification and the production environment are configured.
 */
export async function createPixPayment(_input: PixInput): Promise<Record<string, any>> {
  throw new Error("LIVE_PIX_OPERATIONS_DISABLED");
}

export async function getPayment(_paymentId: string): Promise<Record<string, any>> {
  throw new Error("LIVE_PIX_OPERATIONS_DISABLED");
}

export function verifyMercadoPagoWebhookSignature(_input: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
}): boolean {
  return false;
}
