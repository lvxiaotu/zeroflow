import type { CanvasNode, CanvasNodeKind } from "@zeroflow/core";

export type AiModelOption = {
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
  { value: "gpt-5.5", label: "云雾 / GPT-5.5" },
  { value: "gemini-2.5-flash-image", label: "云雾 / Gemini 图片" }
];

export const defaultLlmModel = "deepseek-chat";
export const defaultImageModel = "gpt-image-2";

export function getAiModelTarget(kind: CanvasNodeKind): AiModelTarget | null {
  switch (kind) {
    case "topic":
    case "script":
    case "structure":
    case "storyboard":
    case "chapter":
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
  return getString(node.data.aiModel, getDefaultAiModelForKind(node.kind));
}

export function getSceneImageModel(node: CanvasNode) {
  return getString(
    node.data.imageModel,
    getString(node.data.aiModel, getDefaultAiModelForKind("image"))
  );
}

function getString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}
