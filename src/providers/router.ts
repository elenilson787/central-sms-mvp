import type { SmsProvider } from "@/src/providers/types";
import { FiveSimProvider } from "@/src/providers/fivesim/adapter";

export class ProviderRouter {
  private readonly providers: SmsProvider[];

  constructor(providers: SmsProvider[] = [new FiveSimProvider()]) {
    this.providers = providers;
  }

  get(name = "5sim"): SmsProvider {
    const provider = this.providers.find((item) => item.name === name);
    if (!provider) throw new Error(`PROVIDER_NOT_CONFIGURED:${name}`);
    return provider;
  }
}
