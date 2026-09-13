export function activationProductName(product: string, productLabel?: string) {
  const friendly = productLabel?.trim();
  if (friendly) return friendly;

  const raw = product.trim();
  if (!raw || /^\d+$/.test(raw)) return "serviço selecionado";
  return raw;
}

export function activationCountryName(country: string) {
  const code = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return country;

  try {
    return new Intl.DisplayNames(["pt-BR"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function terminalActivationMessage(status: string) {
  if (status === "refunded") {
    return "O fornecedor encerrou o pedido sem entregar o SMS. O valor desta ativação foi devolvido automaticamente à sua carteira.";
  }
  if (status === "expired") {
    return "O número expirou antes de receber o SMS. O valor desta ativação foi devolvido automaticamente à sua carteira.";
  }
  if (status === "cancelled") {
    return "A ativação foi cancelada antes do recebimento do SMS. O valor foi devolvido automaticamente à sua carteira.";
  }
  return "Esta ativação foi encerrada e não receberá novas atualizações de SMS.";
}
