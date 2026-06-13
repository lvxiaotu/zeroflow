import { getScriptPromptProfile } from "@zeroflow/core";
import { readEnv } from "./env";
import { createMockLlmProvider } from "./mock";
import type {
  D3DiagramKind,
  GeneratedD3Contract,
  GeneratedScript,
  GeneratedStoryboard,
  LlmProvider,
  ProviderResult
} from "./types";

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
      const targetDurationSec = input.targetDurationSec ?? 60;
      const backend = resolveChatBackend({
        deepseekApiKey: apiKey,
        deepseekBaseUrl: baseUrl,
        defaultModel,
        requestedModel: input.model,
        yunwuApiKey,
        yunwuBaseUrl
      });
      const profile = getScriptPromptProfile(input.scriptProfileId);
      const prompt = [
        "请根据用户输入生成一段占星教学短视频口播文案。输出严格 JSON，不要 Markdown。",
        "重要：用户输入是创作简报，不一定只是标题。你需要提炼核心选题，不要把整段用户输入反复写进文案。",
        `主题：${input.topic}`,
        `文案风格：${profile.label}`,
        `风格说明：${profile.description}`,
        `目标时长：${targetDurationSec} 秒`,
        `字数目标：${getScriptLengthGuidance(targetDurationSec)}`,
        `语气：${input.tone ?? "温和、清楚、适合占星小白"}`,
        `受众：${input.audience ?? "占星小白"}`,
        "风格规则：",
        ...profile.styleRules.map((rule) => `- ${rule}`),
        "推荐结构：",
        ...profile.structure.map((rule, index) => `${index + 1}. ${rule}`),
        "禁止：",
        ...profile.avoidRules.map((rule) => `- ${rule}`),
        "输出要求：",
        "- scriptText 必须是一段完整的、可直接朗读的口播文案。",
        "- 按字数目标写足信息密度，不要写成摘要、提纲或标题扩写。",
        "- 除非用户明确要求极短，否则不要低于字数目标下限。",
        "- 每 1-2 句自然分段，方便后续切分镜。",
        "- title 要从用户输入中提炼，不要照抄一整段需求。",
        "- hook 必须 50 字以内，不能和 title 完全相同。",
        "JSON 字段：title（视频标题）, hook（开场钩子）, scriptText（完整口播文案）, tone（语气风格描述）, targetDurationSec（目标时长秒数）"
      ].join("\n");
      const result = await completeJson<GeneratedScript>({
        ...backend,
        maxTokens: getScriptMaxTokens(targetDurationSec),
        messages: [
          {
            role: "system",
            content: profile.systemRole
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
        `目标总时长：${input.targetDurationSec ?? 60} 秒`,
        `文案：${input.scriptText}`,
        "要求：",
        `- 必须恰好输出 ${input.sceneCount} 个 scenes，不能多也不能少。`,
        "- 每个分镜的 narration 为该段口播内容（从文案中按段落分配）",
        "- sceneType 根据内容选择：text（标题/总结卡）、astro-chart（需要展示星盘时）、sketch（需要插画/示意图时）",
        "- durationSec 根据该段口播字数合理分配，确保总时长接近目标时长",
        "- visualPrompt 必须使用中文，描述该分镜的画面主体、构图、风格和氛围，可直接用于 AI 图片生成",
        "- caption 为该分镜的屏幕文字/标题（出现在视频画面上）",
        "JSON 字段：scenes。scenes 每项字段：title（分镜标题）, description（画面描述）, narration（该段口播文案原文）, sceneType（text/astro-chart/sketch）, durationSec（该段时长秒数）, visualPrompt（中文视觉提示词）, caption（屏幕文字）"
      ].join("\n");
      const result = await completeJson<GeneratedStoryboard>({
        ...backend,
        messages: [
          {
            role: "system",
            content:
              "你是占星教学短视频的分镜导演。你需要把一段口播文案合理分配到多个分镜中，每个分镜的画面类型（文字/星盘/插图）与讲解内容匹配，时长分配均衡，视觉提示清晰可执行。"
          },
          { role: "user", content: prompt }
        ],
        fallback
      });

      return result;
    },
    async generateD3Contract(input) {
      const fallback = () => mock.generateD3Contract(input);
      const backend = resolveChatBackend({
        deepseekApiKey: apiKey,
        deepseekBaseUrl: baseUrl,
        defaultModel,
        requestedModel: input.model,
        yunwuApiKey,
        yunwuBaseUrl
      });
      const backendApiKey = backend.apiKey;

      if (!backendApiKey) {
        return fallback();
      }

      let messages = buildD3ContractMessages(input);
      let lastContent = "";

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const payload = await requestCompletion({
            apiKey: backendApiKey,
            baseUrl: backend.baseUrl,
            model: backend.model,
            maxTokens: 2400,
            messages,
            responseFormat: true
          });
          const content = payload?.choices?.[0]?.message?.content ?? "";
          lastContent = content;
          const data = content ? parseJsonContent<GeneratedD3Contract>(content) : null;
          const validation = validateD3Contract(data);

          if (payload && validation.ok) {
            return {
              provider: backend.provider,
              usedMock: false,
              data: validation.data,
              raw: payload
            };
          }

          const errors = validation.ok ? ["模型响应缺失"] : validation.errors;
          messages = [
            ...buildD3ContractMessages(input),
            {
              role: "user",
              content: [
                "上一次输出没有通过 D3 合约校验，请修复后只返回严格 JSON。",
                `校验错误：${errors.join("；")}`,
                `上一次输出：${lastContent.slice(0, 2400)}`
              ].join("\n")
            }
          ];
        } catch {
          return fallback();
        }
      }

      return fallback();
    }
  };
}

function buildD3ContractMessages(input: {
  prompt: string;
  title?: string;
  description?: string;
  narration?: string;
  diagram?: D3DiagramKind;
  durationSec?: number;
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是数据可视化信息架构师。",
        "你的任务是把用户的自然语言需求转换为 D3 图表合约 JSON。",
        "只输出严格 JSON，不要 Markdown，不要解释，不要 SVG/HTML/JavaScript 代码。"
      ].join("")
    },
    {
      role: "user",
      content: [
        "根据用户需求生成一个 D3 图表合约。",
        `用户需求：${input.prompt}`,
        input.title ? `已有标题：${input.title}` : "",
        input.description ? `已有描述：${input.description}` : "",
        input.narration ? `已有旁白：${input.narration}` : "",
        input.diagram ? `优先图表类型：${input.diagram}` : "",
        `建议时长：${input.durationSec ?? 8} 秒`,
        "",
        "可选 diagram 只能是 timeline, relationship, tree, distribution 之一。",
        "如果表达流程、阶段、时间顺序，用 timeline，data 必须是 { events: [{ label, value }] }。",
        "如果表达概念之间的关联，用 relationship，data 必须是 { nodes: string[], links: [[source, target]] }。",
        "如果表达层级、分类、拆解，用 tree，data 必须是 { root: string, children: string[] }。",
        "如果表达权重、比例、对比，用 distribution，data 必须是 { values: [{ label, value }] }。",
        "label 使用简短中文或英文，不要超过 12 个汉字或 24 个英文字符。",
        "输出 JSON 字段：title, description, narration, diagram, visualPreset, durationSec, data。",
        "visualPreset 必须等于 diagram。"
      ]
        .filter(Boolean)
        .join("\n")
    }
  ];
}

function validateD3Contract(
  value: GeneratedD3Contract | null
): { ok: true; data: GeneratedD3Contract } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!value || typeof value !== "object") {
    return { ok: false, errors: ["输出必须是 JSON object"] };
  }

  if (typeof value.title !== "string" || value.title.trim().length === 0) {
    errors.push("title 必须是非空字符串");
  }
  if (typeof value.description !== "string" || value.description.trim().length === 0) {
    errors.push("description 必须是非空字符串");
  }
  if (typeof value.narration !== "string" || value.narration.trim().length === 0) {
    errors.push("narration 必须是非空字符串");
  }
  if (!isD3DiagramKind(value.diagram)) {
    errors.push("diagram 必须是 timeline, relationship, tree, distribution 之一");
  }

  const data = d3ContractData(value);
  const dataErrors = isD3DiagramKind(value.diagram)
    ? validateD3Data(value.diagram, data)
    : ["diagram 无效，无法校验 data"];

  errors.push(...dataErrors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      title: value.title.trim(),
      description: value.description.trim(),
      narration: value.narration.trim(),
      diagram: value.diagram,
      visualPreset: value.diagram,
      durationSec:
        typeof value.durationSec === "number" && Number.isFinite(value.durationSec)
          ? Math.max(1, Math.min(Math.round(value.durationSec), 30))
          : 8,
      data
    }
  };
}

function d3ContractData(value: GeneratedD3Contract) {
  if (value.data && typeof value.data === "object") {
    return value.data;
  }

  if (typeof value.dataJson === "string") {
    try {
      return JSON.parse(value.dataJson) as unknown;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function validateD3Data(diagram: D3DiagramKind, data: unknown) {
  const record = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;

  if (!record) {
    return ["data 必须是 JSON object"];
  }

  if (diagram === "relationship") {
    return Array.isArray(record.nodes) && Array.isArray(record.links)
      ? []
      : ["relationship data 必须包含 nodes[] 和 links[]"];
  }

  if (diagram === "tree") {
    return typeof record.root === "string" && Array.isArray(record.children)
      ? []
      : ["tree data 必须包含 root 和 children[]"];
  }

  if (diagram === "distribution") {
    return Array.isArray(record.values)
      ? []
      : ["distribution data 必须包含 values[]"];
  }

  return Array.isArray(record.events) ? [] : ["timeline data 必须包含 events[]"];
}

function isD3DiagramKind(value: unknown): value is D3DiagramKind {
  return (
    value === "timeline" ||
    value === "relationship" ||
    value === "tree" ||
    value === "distribution"
  );
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

function getScriptLengthGuidance(targetDurationSec: number) {
  const duration = Math.max(30, Math.min(Math.round(targetDurationSec), 1800));

  if (duration <= 30) {
    return "约 220-350 个汉字，适合 30 秒快节奏口播";
  }

  if (duration <= 60) {
    return "约 450-650 个汉字，适合 1 分钟完整教学口播";
  }

  if (duration <= 300) {
    return "约 2200-3200 个汉字，适合 5 分钟分段教学长稿";
  }

  if (duration <= 900) {
    return "约 6500-9000 个汉字，适合 15 分钟课程型讲稿；必须分成清晰小节";
  }

  return "约 12000-18000 个汉字，适合 30 分钟课程型长讲稿；必须分成清晰章节和小节";
}

function getScriptMaxTokens(targetDurationSec: number) {
  if (targetDurationSec <= 30) return 1400;
  if (targetDurationSec <= 60) return 2200;
  if (targetDurationSec <= 300) return 7000;
  if (targetDurationSec <= 900) return 16000;
  return 30000;
}

async function completeJson<T>({
  apiKey,
  baseUrl,
  model,
  provider,
  maxTokens,
  messages,
  fallback
}: {
  apiKey?: string;
  baseUrl: string;
  model: string;
  provider: string;
  maxTokens?: number;
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
      maxTokens,
      responseFormat: true
    });
    const retryPayload = payload
      ? null
      : await requestCompletion({
          apiKey,
          baseUrl,
          model,
          messages,
          maxTokens,
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
  maxTokens,
  responseFormat
}: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
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
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
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
