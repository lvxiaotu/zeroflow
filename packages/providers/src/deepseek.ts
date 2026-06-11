import { readEnv } from "./env";
import { createMockLlmProvider } from "./mock";
import type { GeneratedScript, GeneratedStoryboard, LlmProvider, ProviderResult } from "./types";

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type DeepSeekResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export function createDeepSeekProvider(): LlmProvider {
  const apiKey = readEnv("DEEPSEEK_API_KEY");
  const baseUrl = readEnv("DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com";
  const defaultModel = readEnv("DEEPSEEK_MODEL") ?? "deepseek-chat";
  const yunwuApiKey = readEnv("YUNWU_API_KEY");
  const yunwuBaseUrl = readEnv("YUNWU_BASE_URL") ?? "https://yunwu.ai/v1";
  const mock = createMockLlmProvider();

  if (!apiKey && !yunwuApiKey) {
    return mock;
  }

  return {
    async generateScript(input) {
      const fallback = () => mock.generateScript(input);
      const backend = resolveChatBackend({
        deepseekApiKey: apiKey,
        deepseekBaseUrl: baseUrl,
        defaultModel,
        requestedModel: input.model,
        yunwuApiKey,
        yunwuBaseUrl
      });
      const prompt = [
        "请为一个占星教学短视频生成完整教学文案。输出严格 JSON，不要 Markdown。",
        `主题：${input.topic}`,
        `目标时长：${input.targetDurationSec ?? 45} 秒`,
        `语气：${input.tone ?? "温和、清楚、适合占星小白"}`,
        `受众：${input.audience ?? "占星小白"}`,
        '要求：',
        '- 这是一篇面向零基础小白的占星教学短视频口播文案',
        '- scriptText 必须是一段完整的、可直接朗读的口播文案，300-500 字',
        '- 结构要求：以 hook（悬念/提问开场）→ 核心概念解释 → 深入讲解 → 实用例子/类比 → 总结收尾',
        '- 语言口语化、有节奏感，适合短视频旁白风格',
        '- 用具体例子或生活化比喻来解释抽象占星概念',
        'JSON 字段：title（视频标题）, hook（开场悬念句50字以内）, scriptText（完整口播文案）, tone（语气风格描述）, targetDurationSec（目标时长秒数）'
      ].join("\n");
      const result = await completeJson<GeneratedScript>({
        ...backend,
        messages: [
          {
            role: "system",
            content: "你是资深占星教学短视频编导，擅长把抽象占星概念讲得准确、温和、可视化。你的文案特点是：1) 每集围绕一个核心知识点展开 2) 开头用问题或现象抓住注意力 3) 用生活化比喻解释专业术语 4) 节奏分明、口语流畅 5) 结尾有总结或预告。文案长度对应 45-60 秒口播。"
          },
          { role: "user", content: prompt }
        ],
        fallback
      });

      return result;
    },
    async generateStoryboard(input) {
      const fallback = () => mock.generateStoryboard(input);
      const backend = resolveChatBackend({
        deepseekApiKey: apiKey,
        deepseekBaseUrl: baseUrl,
        defaultModel,
        requestedModel: input.model,
        yunwuApiKey,
        yunwuBaseUrl
      });
      const prompt = [
        "请根据占星教学短视频的文案，生成详细的分镜方案。输出严格 JSON，不要 Markdown。",
        `分镜数量：${input.sceneCount}`,
        `目标总时长：${input.targetDurationSec ?? 45} 秒`,
        `文案：${input.scriptText}`,
        "要求：",
        "- 每个分镜的 narration 为该段口播内容（从文案中按段落分配）",
        "- sceneType 根据内容选择：text（标题/总结卡）、astro-chart（需要展示星盘时）、sketch（需要插画/示意图时）",
        "- durationSec 根据该段口播字数合理分配，确保总时长接近目标时长",
        "- visualPrompt 用英文描述该分镜的视觉画面风格（用于 AI 插画生成）",
        "- caption 为该分镜的屏幕文字/标题（出现在视频画面上）",
        "JSON 字段：scenes。scenes 每项字段：title（分镜标题）, description（画面描述）, narration（该段口播文案原文）, sceneType（text/astro-chart/sketch）, durationSec（该段时长秒数）, visualPrompt（视觉提示词，英文）, caption（屏幕文字）"
      ].join("\n");
      const result = await completeJson<GeneratedStoryboard>({
        ...backend,
        messages: [
          {
            role: "system",
            content: "你是占星教学短视频的分镜导演。你需要把一段口播文案合理分配到多个分镜中，每个分镜的画面类型（文字/星盘/插图）与讲解内容匹配，时长分配均衡，视觉提示清晰可执行。"
          },
          { role: "user", content: prompt }
        ],
        fallback
      });

      return result;
    }
  };
}

function resolveChatBackend({
  deepseekApiKey,
  deepseekBaseUrl,
  defaultModel,
  requestedModel,
  yunwuApiKey,
  yunwuBaseUrl
}: {
  deepseekApiKey?: string;
  deepseekBaseUrl: string;
  defaultModel: string;
  requestedModel?: string;
  yunwuApiKey?: string;
  yunwuBaseUrl: string;
}) {
  const model = requestedModel ?? defaultModel;
  const useDeepSeek = model.startsWith("deepseek");

  if (useDeepSeek || !yunwuApiKey) {
    return {
      apiKey: deepseekApiKey,
      baseUrl: deepseekBaseUrl,
      model: useDeepSeek ? model : defaultModel,
      provider: "deepseek"
    };
  }

  return {
    apiKey: yunwuApiKey,
    baseUrl: yunwuBaseUrl,
    model,
    provider: "yunwu-llm"
  };
}

async function completeJson<T>({
  apiKey,
  baseUrl,
  model,
  provider,
  messages,
  fallback
}: {
  apiKey?: string;
  baseUrl: string;
  model: string;
  provider: string;
  messages: ChatMessage[];
  fallback: () => Promise<ProviderResult<T>>;
}): Promise<ProviderResult<T>> {
  if (!apiKey) {
    return fallback();
  }

  try {
    const payload = await requestCompletion({
      apiKey,
      baseUrl,
      model,
      messages,
      responseFormat: true
    });
    const retryPayload = payload
      ? null
      : await requestCompletion({
          apiKey,
          baseUrl,
          model,
          messages,
          responseFormat: false
        });
    const finalPayload = payload ?? retryPayload;
    const content = finalPayload?.choices?.[0]?.message?.content;
    const data = content ? parseJsonContent<T>(content) : null;

    if (!finalPayload || !data) {
      return fallback();
    }

    return {
      provider,
      usedMock: false,
      data,
      raw: finalPayload
    };
  } catch {
    return fallback();
  }
}

async function requestCompletion({
  apiKey,
  baseUrl,
  model,
  messages,
  responseFormat
}: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
  responseFormat: boolean;
}) {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        ...(responseFormat ? { response_format: { type: "json_object" } } : {})
      })
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as DeepSeekResponse;
}

function parseJsonContent<T>(value: string) {
  const stripped = value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  try {
    return JSON.parse(stripped) as T;
  } catch {
    const jsonObject = stripped.match(/\{[\s\S]*\}/)?.[0];
    return jsonObject ? (JSON.parse(jsonObject) as T) : null;
  }
}
