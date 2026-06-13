import type { CanvasNode, CanvasNodeKind } from "@zeroflow/core";

export type AiPromptDataKey = "topic" | "scriptText" | "chapterScriptText" | "prompt";

export function getAiPromptDataKey(kind: CanvasNodeKind): AiPromptDataKey | null {
  switch (kind) {
    case "topic":
      return "topic";
    case "script":
    case "storyboard":
      return "scriptText";
    case "chapter":
      return "chapterScriptText";
    case "image":
    case "d3":
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
      return firstString(node.data.scriptText, node.data.prompt);
    case "chapter":
      return firstString(node.data.chapterScriptText, node.data.summary, node.data.description);
    case "image":
      return firstString(node.data.prompt, node.data.visualPrompt, node.data.description);
    case "d3":
      return firstString(node.data.prompt, node.data.description, node.data.title);
    default:
      return "";
  }
}

export function getAiPromptLabel(kind: CanvasNodeKind) {
  switch (kind) {
    case "script":
    case "storyboard":
      return "文案内容";
    case "chapter":
      return "本章文案";
    case "image":
      return "图片提示词";
    case "d3":
      return "D3 图表提示词";
    default:
      return "提示词";
  }
}

export function getAiPromptPlaceholder(kind: CanvasNodeKind) {
  switch (kind) {
    case "topic":
      return "输入你想制作的视频主题，或者粘贴一段创作简报。";
    case "script":
    case "storyboard":
      return "直接输入或粘贴完整口播文案，写完后点击生成分镜。";
    case "chapter":
      return "直接编辑这一章的口播内容，写完后点击展开本章分镜。";
    case "image":
      return "描述要生成的画面、风格、主体和构图。";
    case "d3":
      return "描述你想表达的数据关系、流程、层级或对比，系统会生成可渲染的 D3 图表数据。";
    default:
      return "";
  }
}

export function getAiPromptRows(kind: CanvasNodeKind) {
  switch (kind) {
    case "script":
    case "storyboard":
    case "chapter":
      return 10;
    case "image":
    case "d3":
      return 5;
    default:
      return 4;
  }
}

function firstString(...values: unknown[]) {
  const value = values.find((item) => typeof item === "string" && item.trim().length > 0);
  return typeof value === "string" ? value : "";
}
