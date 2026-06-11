import type { VideoFormat } from "@zeroflow/core";

export const REMOTION_COMP_ID = "AstroCanvasPreview";

export function getCompositionSize(format: VideoFormat) {
  if (format === "landscape") {
    return { width: 1920, height: 1080 };
  }

  if (format === "square") {
    return { width: 1080, height: 1080 };
  }

  return { width: 1080, height: 1920 };
}
