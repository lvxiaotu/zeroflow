import type { ThreeSceneSpec } from "@zeroflow/core";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CaptionLayer } from "../components/CaptionLayer";
import { RemoteVisualAsset } from "../components/RemoteVisualAsset";

export function ThreeScene({ scene }: { scene: ThreeSceneSpec }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const reveal = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic)
  });

  if (scene.renderMode === "asset" && scene.assetUrl) {
    return (
      <AbsoluteFill
        style={{
          overflow: "hidden",
          background: "linear-gradient(180deg, #102c2a 0%, #1b3f39 58%, #0e1918 100%)",
          color: "#fbfaf4"
        }}
      >
        <RemoteVisualAsset
          alt={scene.title}
          src={scene.assetUrl}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: reveal,
            objectFit: "cover",
            transform: `scale(${0.985 + reveal * 0.015})`
          }}
        />
        <CaptionLayer caption={scene.caption} />
      </AbsoluteFill>
    );
  }

  const orbit = interpolate(frame, [0, durationInFrames], [0, 360], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const data = recordData(scene.data);
  const accentColor = stringData(data?.accentColor) ?? "#e8c164";
  const focus = stringData(data?.focus) ?? (scene.scene === "planet-focus" ? "Sun" : "Ascendant");
  const focusFontSize = focus.length > 7 ? 22 : 34;

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background: "linear-gradient(180deg, #102c2a 0%, #1b3f39 58%, #0e1918 100%)",
        color: "#fbfaf4"
      }}
    >
      <svg
        viewBox="0 0 1080 1260"
        style={{
          position: "absolute",
          left: 0,
          top: 210,
          width: 1080,
          height: 1260,
          opacity: reveal
        }}
      >
        <rect x="0" y="0" width="1080" height="1260" fill="transparent" />
        <g transform="translate(540 520)">
          <ellipse cx="0" cy="0" rx="370" ry="126" fill="none" stroke={accentColor} strokeOpacity="0.5" strokeWidth="7" />
          <ellipse cx="0" cy="0" rx="250" ry="84" fill="none" stroke="#fbfaf4" strokeOpacity="0.18" strokeWidth="5" />
          <g transform={`rotate(${orbit})`}>
            <circle cx="370" cy="0" r="32" fill={accentColor} />
            <circle cx="-250" cy="0" r="20" fill="#fbfaf4" opacity="0.76" />
          </g>
          <circle cx="0" cy="0" r="96" fill="#fbfaf4" opacity="0.92" />
          <circle cx="0" cy="0" r="72" fill="#26443d" />
          <text
            x="0"
            y={focusFontSize / 3}
            textAnchor="middle"
            fill="#fbfaf4"
            fontSize={focusFontSize}
            fontWeight="900"
          >
            {focus}
          </text>
        </g>
        <g opacity="0.64">
          {Array.from({ length: 36 }, (_, index) => (
            <circle
              key={index}
              cx={90 + ((index * 137) % 900)}
              cy={80 + ((index * 211) % 900)}
              r={index % 5 === 0 ? 4 : 2}
              fill="#fbfaf4"
            />
          ))}
        </g>
      </svg>
      <CaptionLayer caption={scene.caption} />
    </AbsoluteFill>
  );
}

function recordData(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringData(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
