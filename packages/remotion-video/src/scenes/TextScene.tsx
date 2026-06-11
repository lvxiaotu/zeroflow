import type { TextSceneSpec } from "@zeroflow/core";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CaptionLayer } from "../components/CaptionLayer";

export function TextScene({ scene }: { scene: TextSceneSpec }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const intro = interpolate(frame, [0, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic)
  });
  const slowDrift = interpolate(frame, [0, durationInFrames], [0, -34], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background:
          "linear-gradient(160deg, #102c2a 0%, #18483d 48%, #efe3c5 100%)",
        color: "#fbfaf4"
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.22,
          backgroundImage:
            "radial-gradient(circle at 18% 22%, rgba(255,255,255,0.7) 0 2px, transparent 3px), radial-gradient(circle at 72% 16%, rgba(255,255,255,0.55) 0 2px, transparent 3px), radial-gradient(circle at 56% 72%, rgba(255,255,255,0.42) 0 2px, transparent 3px)",
          backgroundSize: "320px 320px"
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 84,
          right: 84,
          top: 260 + slowDrift,
          opacity: intro,
          transform: `translateY(${(1 - intro) * 34}px)`
        }}
      >
        <div
          style={{
            marginBottom: 28,
            color: "#e8c164",
            fontSize: 36,
            fontWeight: 800,
            letterSpacing: 0
          }}
        >
          {scene.title}
        </div>
        <h1
          style={{
            margin: 0,
            maxWidth: 860,
            fontSize: 108,
            fontWeight: 900,
            letterSpacing: 0,
            lineHeight: 1.04
          }}
        >
          {scene.headline}
        </h1>
        {scene.body ? (
          <p
            style={{
              margin: "46px 0 0",
              maxWidth: 760,
              color: "rgba(255,255,255,0.84)",
              fontSize: 44,
              fontWeight: 700,
              letterSpacing: 0,
              lineHeight: 1.32
            }}
          >
            {scene.body}
          </p>
        ) : null}
      </div>
      <CaptionLayer caption={scene.caption} />
    </AbsoluteFill>
  );
}
