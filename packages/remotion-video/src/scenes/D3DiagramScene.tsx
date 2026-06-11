import type { D3DiagramSceneSpec } from "@zeroflow/core";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { CaptionLayer } from "../components/CaptionLayer";
import { RemoteVisualAsset } from "../components/RemoteVisualAsset";

type DiagramPoint = {
  label: string;
  value: number;
};

const fallbackPoints: DiagramPoint[] = [
  { label: "Birth moment", value: 0 },
  { label: "Eastern horizon", value: 1 },
  { label: "Rising sign", value: 2 },
  { label: "First impression", value: 3 }
];

export function D3DiagramScene({ scene }: { scene: D3DiagramSceneSpec }) {
  const frame = useCurrentFrame();
  const reveal = interpolate(frame, [0, 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic)
  });

  if (scene.renderMode === "asset" && scene.assetUrl) {
    return (
      <AbsoluteFill
        style={{
          overflow: "hidden",
          background: "#f7f1df",
          color: "#18352f"
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

  const points = diagramPoints(scene);

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background: "#f7f1df",
        color: "#18352f"
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 74,
          right: 74,
          top: 108,
          opacity: reveal,
          transform: `translateY(${(1 - reveal) * 22}px)`
        }}
      >
        <div
          style={{
            color: "#9b6828",
            fontSize: 32,
            fontWeight: 900,
            letterSpacing: 0,
            textTransform: "uppercase"
          }}
        >
          D3 contract: {scene.diagram}
        </div>
        <h2
          style={{
            margin: "18px 0 0",
            maxWidth: 840,
            fontSize: 78,
            fontWeight: 900,
            lineHeight: 1.04,
            letterSpacing: 0
          }}
        >
          {scene.title}
        </h2>
      </div>

      <svg
        viewBox="0 0 1080 1180"
        style={{
          position: "absolute",
          left: 0,
          top: 330,
          width: 1080,
          height: 1180,
          opacity: reveal,
          transform: `scale(${0.96 + reveal * 0.04})`
        }}
      >
        <rect x="0" y="0" width="1080" height="1180" fill="#f7f1df" />
        <g transform="translate(112 130)">
          {scene.diagram === "distribution" ? (
            <Distribution points={points} reveal={reveal} />
          ) : scene.diagram === "tree" ? (
            <Tree points={points} reveal={reveal} />
          ) : (
            <Timeline points={points} reveal={reveal} />
          )}
        </g>
      </svg>
      <CaptionLayer caption={scene.caption} />
    </AbsoluteFill>
  );
}

function Timeline({ points, reveal }: { points: DiagramPoint[]; reveal: number }) {
  const width = 820;
  const step = points.length > 1 ? width / (points.length - 1) : width;

  return (
    <g>
      <line x1="0" y1="340" x2={width} y2="340" stroke="#26443d" strokeWidth="8" />
      {points.map((point, index) => {
        const x = index * step;
        const y = 340 - (index % 2) * 120;

        return (
          <g key={point.label} opacity={Math.min(1, reveal + index * 0.08)}>
            <line x1={x} y1="340" x2={x} y2={y} stroke="#c89437" strokeWidth="6" />
            <circle cx={x} cy={y} r="28" fill="#c89437" />
            <text x={x} y={y + 76} textAnchor="middle" fill="#18352f" fontSize="31" fontWeight="900">
              {point.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Tree({ points, reveal }: { points: DiagramPoint[]; reveal: number }) {
  const children = points.slice(1, 5);

  return (
    <g>
      <circle cx="410" cy="120" r="52" fill="#26443d" />
      <text x="410" y="212" textAnchor="middle" fill="#18352f" fontSize="34" fontWeight="900">
        {points[0]?.label ?? "Root"}
      </text>
      {children.map((point, index) => {
        const x = 130 + index * 190;
        const y = 430;

        return (
          <g key={point.label} opacity={Math.min(1, reveal + index * 0.08)}>
            <path d={`M 410 174 C 410 290, ${x} 290, ${x} ${y - 56}`} fill="none" stroke="#c89437" strokeWidth="7" />
            <circle cx={x} cy={y} r="44" fill="#fefbf2" stroke="#26443d" strokeWidth="7" />
            <text x={x} y={y + 84} textAnchor="middle" fill="#18352f" fontSize="28" fontWeight="900">
              {point.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Distribution({ points, reveal }: { points: DiagramPoint[]; reveal: number }) {
  const maxValue = Math.max(...points.map((point) => point.value), 1);

  return (
    <g>
      {points.map((point, index) => {
        const width = (point.value / maxValue) * 680 * reveal;
        const y = index * 128 + 120;

        return (
          <g key={point.label}>
            <text x="0" y={y - 22} fill="#18352f" fontSize="31" fontWeight="900">
              {point.label}
            </text>
            <rect x="0" y={y} width="720" height="54" rx="8" fill="#e8dcc4" />
            <rect x="0" y={y} width={width} height="54" rx="8" fill={index % 2 === 0 ? "#26443d" : "#c89437"} />
          </g>
        );
      })}
    </g>
  );
}

function diagramPoints(scene: D3DiagramSceneSpec): DiagramPoint[] {
  if (scene.diagram === "distribution") {
    const values = recordData(scene.data)?.values;
    if (Array.isArray(values)) {
      const points = values.flatMap((item) => {
        const record = recordData(item);
        const label = stringData(record?.label);
        const value = numberData(record?.value);
        return label && value !== undefined ? [{ label, value }] : [];
      });

      if (points.length > 0) {
        return points;
      }
    }
  }

  const events = recordData(scene.data)?.events;
  if (Array.isArray(events)) {
    const points = events.flatMap((item, index) => {
      const record = recordData(item);
      const label = stringData(record?.label);
      return label ? [{ label, value: numberData(record?.value) ?? index }] : [];
    });

    if (points.length > 0) {
      return points;
    }
  }

  const children = recordData(scene.data)?.children;
  const root = stringData(recordData(scene.data)?.root);
  if (root && Array.isArray(children)) {
    return [
      { label: root, value: 0 },
      ...children.flatMap((child, index) =>
        typeof child === "string" ? [{ label: child, value: index + 1 }] : []
      )
    ];
  }

  return fallbackPoints;
}

function recordData(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringData(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberData(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
