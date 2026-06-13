import type { CanvasNode, JobType } from "@zeroflow/core";

export const defaultPreviewFrame = 30;
export const defaultExportFrameRange = "0:60";

export type RenderJobRequest = {
  type: JobType;
  input: Record<string, unknown>;
};

export function getRenderJobRequest(node: CanvasNode): RenderJobRequest | null {
  if (node.kind === "preview") {
    return {
      type: "render-preview",
      input: {
        frame: getPreviewFrame(node)
      }
    };
  }

  if (node.kind === "export") {
    const input: Record<string, unknown> = {};

    if (getExportScope(node) !== "full") {
      input.frameRange = getExportFrameRange(node);
    }

    return {
      type: "render-video",
      input
    };
  }

  return null;
}

export function getPreviewFrame(node: CanvasNode) {
  return numberData(node.data.previewFrame, defaultPreviewFrame);
}

export function getExportFrameRange(node: CanvasNode) {
  return stringData(node.data.frameRange, defaultExportFrameRange);
}

export function getExportScope(node: CanvasNode) {
  return stringData(node.data.exportScope, "full") === "clip" ? "clip" : "full";
}

function stringData(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function numberData(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
