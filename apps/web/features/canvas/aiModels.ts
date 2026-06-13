import type { CanvasNode, CanvasNodeKind } from "@zeroflow/core";

export type AiModelOption = {
  value: string;
  label: string;
};

export type ImageStyleOption = {
  value: string;
  label: string;
};

export type AiModelTarget = "llm" | "image";

export const llmModelOptions: AiModelOption[] = [
  { value: "deepseek-chat", label: "DeepSeek Chat" },
  { value: "gpt-5.5", label: "云雾 / GPT-5.5" },
  { value: "gemini-2.5-pro", label: "云雾 / Gemini 2.5 Pro" }
];

export const imageModelOptions: AiModelOption[] = [
  { value: "gpt-image-2", label: "云雾 / GPT Image 2" },
  { value: "gemini-2.5-flash-image", label: "云雾 / Gemini 图片" }
];

export const imageStyleOptions: ImageStyleOption[] = [
  { value: "whiteboard-sketch", label: "白板简笔画" },
  { value: "whiteboard", label: "白板画" },
  { value: "line-art", label: "线稿" },
  { value: "realistic", label: "现实" },
  { value: "minimal-line", label: "极简线稿" },
  { value: "zodiac-whiteboard", label: "星盘白板草图" }
];

export const defaultLlmModel = "deepseek-chat";
export const defaultImageModel = "gpt-image-2";
export const defaultImageStyle = "whiteboard-sketch";

export function getAiModelTarget(kind: CanvasNodeKind): AiModelTarget | null {
  switch (kind) {
    case "topic":
    case "script":
    case "structure":
    case "storyboard":
    case "chapter":
    case "d3":
      return "llm";
    case "image":
      return "image";
    default:
      return null;
  }
}

export function getAiModelOptionsForKind(kind: CanvasNodeKind) {
  return getAiModelTarget(kind) === "image" ? imageModelOptions : llmModelOptions;
}

export function getDefaultAiModelForKind(kind: CanvasNodeKind) {
  return getAiModelTarget(kind) === "image" ? defaultImageModel : defaultLlmModel;
}

export function getNodeAiModel(node: CanvasNode) {
  if (node.kind === "image") {
    return normalizeImageModelValue(node.data.aiModel);
  }

  return getString(node.data.aiModel, getDefaultAiModelForKind(node.kind));
}

export function getSceneImageModel(node: CanvasNode) {
  return normalizeImageModelValue(node.data.imageModel, node.data.aiModel);
}

export function getNodeImageStyle(node: CanvasNode) {
  return getString(node.data.imageStyle, defaultImageStyle);
}

export function getSceneImageStyle(node: CanvasNode) {
  return getString(node.data.imageStyle, getString(node.data.visualStyle, defaultImageStyle));
}

export function normalizeImageStyleValue(value: string) {
  switch (value) {
    case "whiteboard-sketch":
    case "whiteboard":
    case "line-art":
    case "realistic":
    case "minimal-line":
    case "zodiac-whiteboard":
      return value;
    case "black-whiteboard-teaching":
      return "whiteboard-sketch";
    default:
      return defaultImageStyle;
  }
}

export function normalizeImageModelValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();

    if (isImageGenerationModel(trimmed)) {
      return trimmed;
    }
  }

  return defaultImageModel;
}

function isImageGenerationModel(value: string) {
  const normalized = value.toLowerCase();

  return (
    normalized.includes("image") ||
    normalized.startsWith("img-") ||
    normalized.startsWith("dall-e")
  );
}

function getString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}
