import type { CanvasNode, CanvasNodeKind } from "@zeroflow/core";

export type AiPromptDataKey = "topic" | "scriptText" | "prompt";

export function getAiPromptDataKey(kind: CanvasNodeKind): AiPromptDataKey | null {
  switch (kind) {
    case "topic":
      return "topic";
    case "script":
    case "storyboard":
      return "scriptText";
    case "image":
      return "prompt";
    default:
      return null;
  }
}

export function hasAiPromptInput(kind: CanvasNodeKind) {
  return getAiPromptDataKey(kind) !== null;
}

export function getAiPromptValue(node: CanvasNode) {
  switch (node.kind) {
    case "topic":
      return firstString(node.data.topic, node.data.prompt, node.data.description, node.data.title);
    case "script":
    case "storyboard":
      return firstString(node.data.scriptText, node.data.prompt, node.data.description);
    case "image":
      return firstString(node.data.prompt, node.data.visualPrompt, node.data.description);
    default:
      return "";
  }
}

export function getAiPromptRows(kind: CanvasNodeKind) {
  switch (kind) {
    case "script":
    case "storyboard":
      return 7;
    case "image":
      return 5;
    default:
      return 4;
  }
}

function firstString(...values: unknown[]) {
  const value = values.find((item) => typeof item === "string" && item.trim().length > 0);
  return typeof value === "string" ? value : "";
}
