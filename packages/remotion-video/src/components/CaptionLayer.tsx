import type { CaptionLayout } from "@zeroflow/core";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export function CaptionLayer({ caption }: { caption?: CaptionLayout }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentSec = frame / fps;
  const activeCue = caption?.cues.find(
    (cue) => currentSec >= cue.startSec && currentSec < cue.startSec + cue.durationSec
  );
  const captionText = activeCue?.text ?? caption?.text;

  if (!caption || !captionText) {
    return null;
  }

  const cueFrame = activeCue ? Math.max(0, frame - Math.round(activeCue.startSec * fps)) : frame;
  const reveal = interpolate(cueFrame, [0, Math.round(fps * 0.45)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic)
  });
  const text =
    caption.animation === "typewriter"
      ? captionText.slice(0, Math.max(1, Math.ceil(captionText.length * reveal)))
      : captionText;
  const translateY = caption.animation === "rise" ? (1 - reveal) * 28 - 50 : -50;

  return (
    <div
      style={{
        position: "absolute",
        top: `${caption.yPercent}%`,
        left: 82,
        right: 82,
        transform: `translateY(${translateY}%)`,
        opacity: caption.animation === "none" ? 1 : reveal,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none"
      }}
    >
      <div
        style={{
          maxWidth: 850,
          borderRadius: 8,
          padding: "18px 28px",
          background: caption.backgroundColor ?? "rgba(7, 20, 22, 0.74)",
          boxShadow: "0 24px 70px rgba(0, 0, 0, 0.24)",
          color: caption.color,
          fontSize: caption.fontSize,
          fontWeight: 800,
          letterSpacing: 0,
          lineHeight: 1.18,
          textAlign: "center"
        }}
      >
        {text}
      </div>
    </div>
  );
}
