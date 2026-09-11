export type NumberKind = "ONE_TIME_SMS" | "TEMPORARY_HOSTING";

export type Country = {
  id: string;
  name: string;
  iso?: string;
  prefix?: string;
};

export type Offer = {
  provider: string;
  country: string;
  operator: string;
  product: string;
  kind: NumberKind;
  providerPrice: number;
  providerCurrency: string;
  stock: number;
  successRate?: number;
};

export type PurchaseRequest = {
  country: string;
  operator?: string;
  product: string;
  kind: NumberKind;
};

export type ProviderSms = {
  id?: string | number;
  sender?: string;
  text?: string;
  code?: string;
  receivedAt?: string;
};

export type ProviderActivation = {
  provider: string;
  externalId: string;
  phone: string;
  country: string;
  operator?: string;
  product: string;
  kind: NumberKind;
  providerPrice: number;
  providerCurrency: string;
  status: string;
  expiresAt?: string;
  sms: ProviderSms[];
};

export interface SmsProvider {
  readonly name: string;
  listCountries(): Promise<Country[]>;
  listOffers(country: string, operator?: string): Promise<Offer[]>;
  requestNumber(input: PurchaseRequest): Promise<ProviderActivation>;
  getActivationStatus(externalId: string): Promise<ProviderActivation>;
  cancelActivation(externalId: string): Promise<ProviderActivation>;
  finishActivation?(externalId: string): Promise<ProviderActivation>;
}
