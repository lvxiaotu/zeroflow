import type { JobType } from "@zeroflow/core";

export type ClientProviderHealth = {
  id: "deepseek" | "yunwu" | "runninghub" | "astrochart";
  label: string;
  configured: boolean;
  ready: boolean;
  status: "ready" | "not-configured" | "needs-input" | "unavailable";
  details?: string;
};

export type LiveProviderRunGuard = {
  jobType: JobType;
  providerId: ClientProviderHealth["id"];
  providerLabel: string;
  details?: string;
};

const providerByJobType: Partial<Record<JobType, ClientProviderHealth["id"]>> = {
  "generate-script": "deepseek",
  "generate-storyboard": "deepseek",
  "generate-image": "yunwu",
  "generate-tts": "runninghub"
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

export function getLiveProviderRunGuard(
  jobType: JobType,
  health: ClientProviderHealth[],
  input?: Record<string, unknown>
): LiveProviderRunGuard | null {
  if (jobInputBypassesLiveProvider(jobType, input)) {
    return null;
  }

  const providerId = providerByJobType[jobType];

  if (!providerId) {
    return null;
  }

  const provider = health.find((item) => item.id === providerId);

  if (!provider?.ready) {
    return null;
  }

  return {
    jobType,
    providerId,
    providerLabel: provider.label || fallbackLabels[providerId],
    details: provider.details
  };
}

export function liveProviderConfirmationMessage(guard: LiveProviderRunGuard) {
  const details = guard.details ? `\n\nProvider details: ${guard.details}` : "";

  return [
    `Run ${guard.jobType} with the live ${guard.providerLabel} provider?`,
    "This may consume paid quota or external API credits.",
    "Choose Cancel to keep the canvas unchanged."
  ].join("\n") + details;
}

export function markLiveProviderConfirmed(
  jobType: JobType,
  input: Record<string, unknown>,
  health: ClientProviderHealth[]
) {
  const guard = getLiveProviderRunGuard(jobType, health, input);

  if (!guard) {
    return input;
  }

  return {
    ...input,
    confirmLiveProvider: true,
    confirmedProviderId: guard.providerId
  };
}

function jobInputBypassesLiveProvider(jobType: JobType, input: Record<string, unknown> | undefined) {
  return jobType === "generate-tts" && input?.dryRun === true;
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
