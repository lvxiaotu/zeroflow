export type ClientProviderHealth = {
  id: "deepseek" | "yunwu" | "runninghub" | "astrochart";
  label: string;
  configured: boolean;
  ready: boolean;
  status: "ready" | "not-configured" | "needs-input" | "unavailable";
  details?: string;
};

const fallbackLabels: Record<ClientProviderHealth["id"], string> = {
  deepseek: "DeepSeek",
  yunwu: "Yunwu Image",
  runninghub: "RunningHub IndexTTS",
  astrochart: "AstroChart SVG"
};

export async function fetchProviderHealth() {
  const response = await fetch("/api/providers/check");

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as { health?: ClientProviderHealth[] };
  return Array.isArray(payload.health) ? payload.health : [];
}

export function summarizeProviderHealth(health: ClientProviderHealth[]) {
  if (health.length === 0) {
    return "Provider status unavailable";
  }

  return health
    .filter((item) => item.id !== "astrochart")
    .map((item) => `${fallbackLabels[item.id]}: ${item.status}`)
    .join(" / ");
}
