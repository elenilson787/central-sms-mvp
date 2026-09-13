import { retrieveSmsPoolServices } from "@/src/providers/smspool/client";

const CACHE_TTL_MS = 60 * 60 * 1000;

type ServiceLabelCache = {
  expiresAt: number;
  labels: Map<string, string>;
};

let cache: ServiceLabelCache | null = null;

async function loadLabels() {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.labels;

  const services = await retrieveSmsPoolServices();
  const labels = new Map<string, string>();
  for (const service of services) {
    const id = String(service.ID ?? "").trim();
    const name = String(service.name ?? "").trim();
    if (id && name) labels.set(id, name);
  }

  cache = {
    expiresAt: now + CACHE_TTL_MS,
    labels,
  };
  return labels;
}

export async function resolveSmsPoolServiceLabels(productIds: string[]) {
  const wanted = new Set(productIds.map((value) => value.trim()).filter(Boolean));
  const resolved = new Map<string, string>();
  if (!wanted.size) return resolved;

  try {
    const labels = await loadLabels();
    for (const id of wanted) {
      const label = labels.get(id);
      if (label) resolved.set(id, label);
    }
  } catch (error) {
    console.error("[smspool-service-labels] failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return resolved;
}
