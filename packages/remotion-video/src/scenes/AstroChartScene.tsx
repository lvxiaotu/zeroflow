import type { AstroChartSceneSpec } from "@zeroflow/core";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig
} from "remotion";
import { CaptionLayer } from "../components/CaptionLayer";
import { RemoteVisualAsset } from "../components/RemoteVisualAsset";

const chartCenter = 540;
const chartRadius = 392;

export function AstroChartScene({ scene }: { scene: AstroChartSceneSpec }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const reveal = interpolate(frame, [0, 32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic)
  });
  const rotate = interpolate(frame, [0, durationInFrames], [-5, 7]);
  const ticks = Array.from({ length: 12 }, (_, index) => index);
  const aspectLines = [
    [0, 5],
    [2, 8],
    [3, 10],
    [6, 11],
    [1, 7]
  ] as const;

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background:
          "linear-gradient(180deg, #f7f1df 0%, #d7e5d8 54%, #24443e 100%)",
        color: "#102c2a"
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 72,
          right: 72,
          top: 112,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          opacity: reveal,
          transform: `translateY(${(1 - reveal) * 24}px)`
        }}
      >
        <div>
          <div
            style={{
              color: "#8b6422",
              fontSize: 32,
              fontWeight: 900,
              letterSpacing: 0
            }}
          >
            {scene.title}
          </div>
          <h2
            style={{
              margin: "18px 0 0",
              maxWidth: 690,
              fontSize: 74,
              lineHeight: 1.04,
              letterSpacing: 0
            }}
          >
            上升点是星盘里的入场方向
          </h2>
        </div>
        <div
          style={{
            border: "2px solid rgba(16,44,42,0.2)",
            borderRadius: 8,
            padding: "18px 22px",
            color: "#24443e",
            fontSize: 26,
            fontWeight: 800
          }}
        >
          {scene.highlights[0]?.label ?? "重点"}
        </div>
      </div>

      <svg
        viewBox="0 0 1080 1080"
        style={{
          position: "absolute",
          left: 0,
          top: 390,
          width: 1080,
          height: 1080,
          opacity: reveal,
          transform: `scale(${0.9 + reveal * 0.1}) rotate(${rotate}deg)`
        }}
      >
        <circle cx={chartCenter} cy={chartCenter} r={chartRadius + 46} fill="#fbfaf4" />
        <circle
          cx={chartCenter}
          cy={chartCenter}
          r={chartRadius + 46}
          fill="none"
          stroke="#c89437"
          strokeWidth="10"
        />
        <circle
          cx={chartCenter}
          cy={chartCenter}
          r={chartRadius}
          fill="rgba(255,255,255,0.56)"
          stroke="#24443e"
          strokeWidth="4"
        />
        <circle
          cx={chartCenter}
          cy={chartCenter}
          r={chartRadius - 128}
          fill="none"
          stroke="#24443e"
          strokeOpacity="0.3"
          strokeWidth="3"
        />
        {ticks.map((tick) => {
          const angle = tick * 30 - 90;
          const outer = polar(chartCenter, chartCenter, chartRadius + 44, angle);
          const inner = polar(chartCenter, chartCenter, chartRadius - 128, angle);
          const label = polar(chartCenter, chartCenter, chartRadius + 12, angle + 15);

          return (
            <g key={tick}>
              <line
                x1={outer.x}
                y1={outer.y}
                x2={inner.x}
                y2={inner.y}
                stroke="#24443e"
                strokeOpacity="0.35"
                strokeWidth="3"
              />
              <text
                x={label.x}
                y={label.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#24443e"
                fontSize="31"
                fontWeight="800"
              >
                {tick + 1}
              </text>
            </g>
          );
        })}
        {aspectLines.map(([from, to], index) => {
          const fromPoint = polar(chartCenter, chartCenter, chartRadius - 175, from * 30 - 74);
          const toPoint = polar(chartCenter, chartCenter, chartRadius - 175, to * 30 - 74);

          return (
            <line
              key={`${from}-${to}`}
              x1={fromPoint.x}
              y1={fromPoint.y}
              x2={toPoint.x}
              y2={toPoint.y}
              stroke={index % 2 === 0 ? "#2f6f66" : "#c89437"}
              strokeOpacity="0.64"
              strokeWidth="5"
            />
          );
        })}
        <line
          x1={104}
          y1={chartCenter}
          x2={976}
          y2={chartCenter}
          stroke="#e05f45"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <circle cx={104} cy={chartCenter} r="27" fill="#e05f45" />
        <text
          x={100}
          y={chartCenter - 54}
          textAnchor="middle"
          fill="#e05f45"
          fontSize="44"
          fontWeight="900"
        >
          ASC
        </text>
      </svg>
      {scene.chartAssetUrl ? (
        <RemoteVisualAsset
          alt={scene.title}
          src={scene.chartAssetUrl}
          style={{
            position: "absolute",
            left: 0,
            top: 390,
            width: 1080,
            height: 1080,
            opacity: reveal,
            objectFit: "contain",
            transform: `scale(${0.9 + reveal * 0.1}) rotate(${rotate}deg)`
          }}
        />
      ) : null}
      <CaptionLayer caption={scene.caption} />
    </AbsoluteFill>
  );
}

function polar(cx: number, cy: number, radius: number, angleDeg: number) {
  const angle = (angleDeg * Math.PI) / 180;

  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle)
  };
}
