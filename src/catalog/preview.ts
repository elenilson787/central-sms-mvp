import type { NumberKind, Offer } from "@/src/providers/types";

export type PreviewOffer = Offer & {
  id: string;
  countryName: string;
  label: string;
  description: string;
  preview: true;
};

const PREVIEW_OFFERS: PreviewOffer[] = [
  {
    id: "br-messaging-once",
    provider: "preview",
    country: "brazil",
    countryName: "Brasil",
    operator: "any",
    product: "messaging",
    label: "Mensagens",
    description: "Ativação curta para demonstração do fluxo da Mini App.",
    kind: "ONE_TIME_SMS",
    providerPrice: 2.5,
    providerCurrency: "BRL",
    stock: 42,
    successRate: 96,
    preview: true,
  },
  {
    id: "br-marketplace-once",
    provider: "preview",
    country: "brazil",
    countryName: "Brasil",
    operator: "any",
    product: "marketplace",
    label: "Marketplace",
    description: "Oferta demonstrativa sem compra ou reserva em provider externo.",
    kind: "ONE_TIME_SMS",
    providerPrice: 3.2,
    providerCurrency: "BRL",
    stock: 27,
    successRate: 94,
    preview: true,
  },
  {
    id: "br-temporary-hosting",
    provider: "preview",
    country: "brazil",
    countryName: "Brasil",
    operator: "any",
    product: "temporary-number",
    label: "Número temporário",
    description: "Número mantido por período demonstrativo; operação real continua bloqueada.",
    kind: "TEMPORARY_HOSTING",
    providerPrice: 7.5,
    providerCurrency: "BRL",
    stock: 12,
    successRate: 92,
    preview: true,
  },
  {
    id: "us-messaging-once",
    provider: "preview",
    country: "usa",
    countryName: "Estados Unidos",
    operator: "any",
    product: "messaging",
    label: "Mensagens",
    description: "Ativação curta demonstrativa com preço final calculado no servidor.",
    kind: "ONE_TIME_SMS",
    providerPrice: 4.1,
    providerCurrency: "BRL",
    stock: 31,
    successRate: 95,
    preview: true,
  },
  {
    id: "pt-messaging-once",
    provider: "preview",
    country: "portugal",
    countryName: "Portugal",
    operator: "any",
    product: "messaging",
    label: "Mensagens",
    description: "Oferta de demonstração para filtros de país e serviço.",
    kind: "ONE_TIME_SMS",
    providerPrice: 4.8,
    providerCurrency: "BRL",
    stock: 18,
    successRate: 93,
    preview: true,
  },
  {
    id: "pt-temporary-hosting",
    provider: "preview",
    country: "portugal",
    countryName: "Portugal",
    operator: "any",
    product: "temporary-number",
    label: "Número temporário",
    description: "Demonstração da categoria hosting sem provisionamento externo.",
    kind: "TEMPORARY_HOSTING",
    providerPrice: 9.4,
    providerCurrency: "BRL",
    stock: 8,
    successRate: 91,
    preview: true,
  },
];

export function listPreviewOffers(filters?: { country?: string; kind?: NumberKind; search?: string }) {
  const country = filters?.country?.toLowerCase();
  const search = filters?.search?.trim().toLowerCase();
  return PREVIEW_OFFERS.filter((offer) => {
    if (country && country !== "all" && offer.country !== country) return false;
    if (filters?.kind && offer.kind !== filters.kind) return false;
    if (search && !`${offer.countryName} ${offer.label} ${offer.product}`.toLowerCase().includes(search)) return false;
    return true;
  });
}

export function getPreviewOffer(id: string) {
  return PREVIEW_OFFERS.find((offer) => offer.id === id);
}
