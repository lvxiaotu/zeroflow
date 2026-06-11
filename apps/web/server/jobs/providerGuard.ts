import type { Job, JobType } from "@zeroflow/core";
import { getProviderHealth } from "@zeroflow/providers";

type ProviderId = "deepseek" | "yunwu" | "runninghub" | "astrochart";

export type LiveProviderJobRisk = {
  jobType: JobType;
  providerId: ProviderId;
  providerLabel: string;
  providerStatus: string;
  details?: string;
  confirmationField: "confirmLiveProvider";
};

const providerByJobType: Partial<Record<JobType, ProviderId>> = {
  "generate-script": "deepseek",
  "generate-storyboard": "deepseek",
  "generate-image": "yunwu",
  "generate-tts": "runninghub"
};

const fallbackLabels: Record<ProviderId, string> = {
  deepseek: "DeepSeek",
  yunwu: "Yunwu Image",
  runninghub: "RunningHub IndexTTS",
  astrochart: "AstroChart SVG"
};

export function getLiveProviderJobRisk(jobType: JobType): LiveProviderJobRisk | null {
  const providerId = providerByJobType[jobType];

  if (!providerId) {
    return null;
  }

  const provider = getProviderHealth().find((item) => item.id === providerId);

  if (!provider?.ready) {
    return null;
  }

  return {
    jobType,
    providerId,
    providerLabel: provider.label || fallbackLabels[providerId],
    providerStatus: provider.status,
    details: provider.details,
    confirmationField: "confirmLiveProvider"
  };
}

export function jobInputConfirmsLiveProvider(input: Record<string, unknown> | undefined) {
  return input?.confirmLiveProvider === true;
}

export function jobInputBypassesLiveProvider(
  jobType: JobType,
  input: Record<string, unknown> | undefined
) {
  return jobType === "generate-tts" && input?.dryRun === true;
}

export function jobNeedsLiveProviderConfirmation(
  jobType: JobType,
  input: Record<string, unknown> | undefined
) {
  const risk = getLiveProviderJobRisk(jobType);

  if (!risk || jobInputConfirmsLiveProvider(input) || jobInputBypassesLiveProvider(jobType, input)) {
    return null;
  }

  return risk;
}

export function getUnconfirmedLiveProviderRisk(job: Job) {
  return jobNeedsLiveProviderConfirmation(job.type, job.input);
}
