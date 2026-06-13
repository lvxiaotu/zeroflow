import type { D3DiagramSceneSpec } from "@zeroflow/core";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { CaptionLayer } from "../components/CaptionLayer";
import { RemoteVisualAsset } from "../components/RemoteVisualAsset";

type DiagramPoint = {
  label: string;
  value: number;
};

type RelationshipData = {
  nodes: string[];
  links: Array<[string, string]>;
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
      <svg
        viewBox="0 0 1080 1180"
        style={{
          position: "absolute",
          left: 0,
          top: 180,
          width: 1080,
          height: 1180,
          opacity: reveal,
          transform: `scale(${0.96 + reveal * 0.04})`
        }}
      >
        <defs>
          <filter id="d3-scene-shadow" x="-16%" y="-24%" width="132%" height="148%">
            <feDropShadow dx="0" dy="16" floodColor="#17352f" floodOpacity="0.13" stdDeviation="16" />
          </filter>
          <linearGradient id="d3-scene-card" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f0f6ec" />
          </linearGradient>
          <marker id="d3-scene-arrow" markerHeight="12" markerWidth="12" orient="auto" refX="10" refY="6" viewBox="0 0 12 12">
            <path d="M0 0 L12 6 L0 12 Z" fill="#819989" />
          </marker>
        </defs>
        <rect x="0" y="0" width="1080" height="1180" fill="#f7f1df" />
        <path d="M74 910 C248 780 396 828 560 650 C710 488 820 390 988 264" fill="none" stroke="#e0e9dd" strokeDasharray="14 18" strokeWidth="6" />
        <g transform="translate(112 130)">
          {scene.diagram === "distribution" ? (
            <Distribution points={points} reveal={reveal} />
          ) : scene.diagram === "relationship" ? (
            <Relationship data={relationshipData(scene.data)} reveal={reveal} />
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

function Relationship({ data, reveal }: { data: RelationshipData; reveal: number }) {
  const centerX = 410;
  const centerY = 310;
  const nodes = data.nodes.slice(0, 6);
  const primary = nodes[0] ?? "Core";
  const slots = [
    { x: -28, y: 28, anchorX: 220, anchorY: 82 },
    { x: 600, y: 28, anchorX: 600, anchorY: 82 },
    { x: -28, y: 326, anchorX: 220, anchorY: 380 },
    { x: 600, y: 326, anchorX: 600, anchorY: 380 },
    { x: 286, y: 474, anchorX: 410, anchorY: 474 }
  ];
  const positions = new Map<string, { x: number; y: number; anchorX: number; anchorY: number; width: number; height: number }>(
    [[primary, { x: 286, y: 252, anchorX: centerX, anchorY: centerY, width: 248, height: 116 }]]
  );
  nodes.slice(1).forEach((node, index) => {
    const slot = slots[index] ?? slots[slots.length - 1]!;
    positions.set(node, { ...slot, width: 248, height: 108 });
  });
  const safeLinks = data.links
    .filter(([source, target]) => positions.has(source) && positions.has(target))
    .slice(0, 10);
  const fallbackLinks = nodes.slice(1).map((node) => [primary, node] as [string, string]);
  const links = safeLinks.length > 0 ? safeLinks : fallbackLinks;

  return (
    <g>
      <circle cx={centerX} cy={centerY} fill="#e8efe5" r="166" />
      <circle cx={centerX} cy={centerY} fill="none" opacity="0.72" r="202" stroke="#dbe6d8" strokeDasharray="12 16" strokeWidth="6" />
      {links.map(([source, target], index) => {
        const start = positions.get(source);
        const end = positions.get(target);

        return start && end ? (
          <path
            d={`M ${start.anchorX} ${start.anchorY} C ${centerX} ${start.anchorY}, ${centerX} ${end.anchorY}, ${end.anchorX} ${end.anchorY}`}
            fill="none"
            key={`${source}-${target}-${index}`}
            markerEnd="url(#d3-scene-arrow)"
            opacity={Math.min(1, reveal + index * 0.06)}
            stroke="#819989"
            strokeLinecap="round"
            strokeWidth="8"
          />
        ) : null;
      })}
      {[...positions.entries()].map(([node, position], index) => {
        const accent = index === 0 ? "#2f6d3b" : index % 2 === 0 ? "#c89437" : "#d7b36f";

        return (
          <g filter="url(#d3-scene-shadow)" key={node} opacity={Math.min(1, reveal + index * 0.08)}>
            <rect fill="url(#d3-scene-card)" height={position.height} rx="24" width={position.width} x={position.x} y={position.y} />
            <rect fill={accent} height={position.height} rx="7" width="14" x={position.x} y={position.y} />
            <text fill="#18352f" fontSize={index === 0 ? 34 : 30} fontWeight="900" x={position.x + 34} y={position.y + position.height / 2 - 5}>
              {compactLabel(node, index === 0 ? 16 : 14)}
            </text>
            <text fill="#6f7f75" fontSize="22" fontWeight="800" x={position.x + 34} y={position.y + position.height / 2 + 34}>
              {index === 0 ? "core concept" : `node ${index}`}
            </text>
          </g>
        );
      })}
    </g>
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

function relationshipData(data: unknown): RelationshipData {
  const record = recordData(data);
  const fallbackNodes = ["Birth moment", "Eastern horizon", "Rising sign", "First impression"];
  const nodes = Array.isArray(record?.nodes)
    ? record.nodes.flatMap((node) => (typeof node === "string" ? [node] : []))
    : fallbackNodes;
  const fallbackLinks: Array<[string, string]> = [
    ["Birth moment", "Eastern horizon"],
    ["Eastern horizon", "Rising sign"],
    ["Rising sign", "First impression"]
  ];
  const links = Array.isArray(record?.links)
    ? record.links.flatMap((link) => {
        if (!Array.isArray(link) || link.length < 2) {
          return [];
        }

        const source = stringData(link[0]);
        const target = stringData(link[1]);

        return source && target ? [[source, target] as [string, string]] : [];
      })
    : fallbackLinks;

  return {
    nodes: nodes.length > 0 ? nodes.slice(0, 7) : fallbackNodes,
    links: links.slice(0, 10)
  };
}

function compactLabel(value: string, maxLength = 18) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
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
