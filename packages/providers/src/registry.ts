import { createAstroChartProvider } from "./astrochart";
import { createDeepSeekProvider } from "./deepseek";
import { createIndexTtsProvider } from "./indextts";
import { createYunwuImageProvider } from "./yunwu";
import type { ProviderRegistry } from "./types";

let registry: ProviderRegistry | null = null;

export function getProviders() {
  registry ??= {
    llm: createDeepSeekProvider(),
    image: createYunwuImageProvider(),
    tts: createIndexTtsProvider(),
    chart: createAstroChartProvider()
  };
  return registry;
}

export function resetProvidersForTests() {
  registry = null;
}
