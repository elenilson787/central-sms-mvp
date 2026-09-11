import type {
  Country,
  Offer,
  ProviderActivation,
  PurchaseRequest,
  SmsProvider,
} from "@/src/providers/types";

/**
 * Bootstrap adapter.
 *
 * The provider boundary exists so the application compiles and the catalog/
 * activation flows can be developed safely. Live provider calls remain
 * intentionally disabled until commercial permission, currency and production
 * credentials are reviewed.
 */
export class FiveSimProvider implements SmsProvider {
  readonly name = "5sim";

  async listCountries(): Promise<Country[]> {
    return [];
  }

  async listOffers(_country: string, _operator = "any"): Promise<Offer[]> {
    return [];
  }

  async requestNumber(_input: PurchaseRequest): Promise<ProviderActivation> {
    throw new Error("LIVE_PROVIDER_OPERATIONS_DISABLED");
  }

  async getActivationStatus(_externalId: string): Promise<ProviderActivation> {
    throw new Error("LIVE_PROVIDER_OPERATIONS_DISABLED");
  }

  async cancelActivation(_externalId: string): Promise<ProviderActivation> {
    throw new Error("LIVE_PROVIDER_OPERATIONS_DISABLED");
  }

  async finishActivation(_externalId: string): Promise<ProviderActivation> {
    throw new Error("LIVE_PROVIDER_OPERATIONS_DISABLED");
  }
}
