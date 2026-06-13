import fs from "node:fs";
import { hasEnv, readEnv } from "./env";
import { getIndexTtsRuntimeConfig } from "./indextts";
import { getSwissEphemerisRuntime } from "./natalChart";
import type { ProviderHealth } from "./types";

export function getProviderHealth(): ProviderHealth[] {
  const indexTtsConfig = getIndexTtsRuntimeConfig();
  const swissEphemeris = getSwissEphemerisRuntime();
  const indexttsDir = indexTtsConfig.projectDir;
  const hasTtsReference = Boolean(
    indexTtsConfig.referenceAudioPath || indexTtsConfig.referenceAudioName
  );
  const indexttsDirExists = fs.existsSync(indexttsDir);
  const hasRunningHub = Boolean(indexTtsConfig.runningHubApiKey);
  const yunwuImageModel = normalizeImageModel(readEnv("YUNWU_IMAGE_MODEL"));

  return [
    {
      id: "deepseek",
      label: "DeepSeek",
      configured: hasEnv("DEEPSEEK_API_KEY"),
      ready: hasEnv("DEEPSEEK_API_KEY"),
      status: hasEnv("DEEPSEEK_API_KEY") ? "ready" : "not-configured",
      details: hasEnv("DEEPSEEK_API_KEY")
        ? `${readEnv("DEEPSEEK_MODEL") ?? "deepseek-chat"} @ ${readEnv("DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com"}`
        : "Set DEEPSEEK_API_KEY to enable live script and storyboard generation."
    },
    {
      id: "yunwu",
      label: "Yunwu Image",
      configured: hasEnv("YUNWU_API_KEY"),
      ready: hasEnv("YUNWU_API_KEY"),
      status: hasEnv("YUNWU_API_KEY") ? "ready" : "not-configured",
      details: hasEnv("YUNWU_API_KEY")
        ? `image: ${yunwuImageModel} @ ${readEnv("YUNWU_BASE_URL") ?? "https://yunwu.ai/v1"}`
        : "Set YUNWU_API_KEY to enable live image generation."
    },
    {
      id: "runninghub",
      label: "RunningHub IndexTTS",
      configured: hasRunningHub,
      ready: hasRunningHub && indexttsDirExists && hasTtsReference,
      status: !hasRunningHub
        ? "not-configured"
        : !indexttsDirExists || !hasTtsReference
          ? "needs-input"
          : "ready",
      details: !hasRunningHub
        ? "Set RUNNINGHUB_API_KEY to enable IndexTTS."
        : !indexttsDirExists
          ? `INDEXTTS_CLI_DIR not found: ${indexttsDir}`
          : !hasTtsReference
            ? "Set INDEXTTS_REFERENCE_AUDIO_PATH or INDEXTTS_REFERENCE_AUDIO_NAME."
            : `CLI ready at ${indexttsDir}`
    },
    {
      id: "astrochart",
      label: "AstroChart SVG",
      configured: true,
      ready: true,
      status: "ready",
      details:
        `AstroChart renders SVG; ${swissEphemeris.engine} calculates birth-based planets/cusps.`
    }
  ];
}

function normalizeImageModel(model: string | undefined) {
  const normalized = model?.trim();

  if (!normalized || !isImageGenerationModel(normalized)) {
    return "gpt-image-2";
  }

  return normalized;
}

function isImageGenerationModel(model: string) {
  const normalized = model.toLowerCase();

  return (
    normalized.includes("image") ||
    normalized.startsWith("img-") ||
    normalized.startsWith("dall-e")
  );
}
