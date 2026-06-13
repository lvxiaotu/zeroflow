"use client";

import { max } from "d3-array";
import { hierarchy, tree as d3Tree } from "d3-hierarchy";
import { scaleLinear, scalePoint } from "d3-scale";
import { curveMonotoneX, line as d3Line } from "d3-shape";
import { useEffect, useMemo, useRef } from "react";
import { parseVisualDataJson } from "./visualPresets";

type D3DiagramKind = "timeline" | "relationship" | "tree" | "distribution";
type ThreeSceneKind = "orbit" | "zodiac-space" | "planet-focus";

type PreviewPoint = {
  label: string;
  value: number;
};

type RelationshipData = {
  nodes: string[];
  links: Array<[string, string]>;
};

type TreeData = {
  root: string;
  children: string[];
};

type TreeNodeData = {
  name: string;
  children?: TreeNodeData[];
};

type ThreePreviewData = {
  accentColor: string;
  focus: string;
  speed: number;
};

const fallbackTimeline: PreviewPoint[] = [
  { label: "Birth", value: 0 },
  { label: "Horizon", value: 1 },
  { label: "Rising", value: 2 },
  { label: "Impression", value: 3 }
];

export function D3VisualPreview({
  dataJson,
  diagram,
  title
}: {
  dataJson: string;
  diagram: string;
  title: string;
}) {
  const preview = useMemo(() => buildD3Preview(diagram, dataJson), [dataJson, diagram]);

  return (
    <section className="visual-preview" data-kind="d3">
      <header>
        <strong>{title}</strong>
        <span>D3 preview</span>
      </header>
      <div className="visual-preview-stage">
        {preview.ok ? (
          <svg
            aria-label={`${diagram} preview`}
            className="visual-preview-svg"
            role="img"
            viewBox="0 0 560 340"
          >
            <defs>
              <filter id="d3-preview-shadow" x="-16%" y="-28%" width="132%" height="156%">
                <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#17352f" floodOpacity="0.12" />
              </filter>
              <linearGradient id="d3-preview-card" x1="0%" x2="100%" y1="0%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#f1f6ec" />
              </linearGradient>
              <marker
                id="d3-preview-arrow"
                markerHeight="8"
                markerWidth="8"
                orient="auto"
                refX="7"
                refY="4"
                viewBox="0 0 8 8"
              >
                <path d="M0 0 L8 4 L0 8 Z" fill="#7f9888" />
              </marker>
            </defs>
            <rect width="560" height="340" rx="18" fill="#f7faf4" />
            <path d="M38 286 C142 226 236 238 332 176 C420 120 478 90 530 54" fill="none" stroke="#e2eadf" strokeDasharray="7 10" strokeWidth="3" />
            <g>{renderD3Preview(preview.diagram, preview.data)}</g>
          </svg>
        ) : (
          <VisualPreviewEmpty label={preview.label} />
        )}
      </div>
    </section>
  );
}

export function ThreeVisualPreview({
  accentColor,
  dataJson,
  scene,
  speed,
  title
}: {
  accentColor: string;
  dataJson: string;
  scene: string;
  speed: number;
  title: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const preview = useMemo(
    () => buildThreePreview(scene, dataJson, accentColor, speed),
    [accentColor, dataJson, scene, speed]
  );

  useEffect(() => {
    const host = hostRef.current;

    if (!host || !preview.ok) {
      return;
    }

    let disposed = false;
    let animationFrame = 0;
    let cleanup = () => {
      disposed = true;
    };

    void import("three").then((three) => {
      if (disposed || !host.isConnected) {
        return;
      }

      host.replaceChildren();

      const width = Math.max(220, host.clientWidth);
      const height = Math.max(150, host.clientHeight);
      const scene3d = new three.Scene();
      scene3d.background = new three.Color("#102c2a");

      const camera = new three.PerspectiveCamera(42, width / height, 0.1, 100);
      camera.position.set(0, 1.6, preview.scene === "planet-focus" ? 5.4 : 6.2);

      const renderer = new three.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      renderer.domElement.setAttribute("aria-label", `${scene} Three.js preview`);
      renderer.domElement.className = "visual-preview-canvas";
      host.append(renderer.domElement);

      const group = new three.Group();
      scene3d.add(group);

      const ambient = new three.AmbientLight("#fbfaf4", 1.8);
      scene3d.add(ambient);

      const key = new three.PointLight(preview.data.accentColor, 4.6, 16);
      key.position.set(2.5, 3, 4);
      scene3d.add(key);

      const orbit = makeOrbitGroup(three, preview.data, preview.scene);
      group.add(orbit);

      const stars = makeStarField(three, preview.scene);
      scene3d.add(stars);

      const render = (time: number) => {
        if (disposed) {
          return;
        }

        const rotation = time * 0.00018 * preview.data.speed;
        group.rotation.y = rotation;
        group.rotation.x = preview.scene === "zodiac-space" ? -0.18 : 0;
        stars.rotation.y = rotation * 0.25;
        renderer.render(scene3d, camera);
        animationFrame = window.requestAnimationFrame(render);
      };

      render(0);

      cleanup = () => {
        disposed = true;
        window.cancelAnimationFrame(animationFrame);
        renderer.dispose();
        orbit.traverse((item) => disposeThreeObject(item));
        stars.traverse((item) => disposeThreeObject(item));
        host.replaceChildren();
      };
    });

    return () => cleanup();
  }, [preview, scene]);

  return (
    <section className="visual-preview" data-kind="three">
      <header>
        <strong>{title}</strong>
        <span>Three.js preview</span>
      </header>
      <div className="visual-preview-stage visual-preview-three">
        {preview.ok ? <div className="visual-preview-three-host" ref={hostRef} /> : <VisualPreviewEmpty label={preview.label} />}
      </div>
    </section>
  );
}

function renderD3Preview(diagram: D3DiagramKind, data: unknown) {
  if (diagram === "distribution") {
    return <DistributionPreview points={distributionPoints(data)} />;
  }

  if (diagram === "relationship") {
    return <RelationshipPreview data={relationshipData(data)} />;
  }

  if (diagram === "tree") {
    return <TreePreview data={treeData(data)} />;
  }

  return <TimelinePreview points={timelinePoints(data)} />;
}

function TimelinePreview({ points }: { points: PreviewPoint[] }) {
  const labels = points.map((point) => point.label);
  const xScale = scalePoint<string>().domain(labels).range([64, 496]).padding(0.32);
  const yScale = scaleLinear()
    .domain([0, Math.max(max(points, (point) => point.value) ?? 1, 1)])
    .range([222, 92]);
  const path =
    d3Line<PreviewPoint>()
      .x((point) => xScale(point.label) ?? 0)
      .y((point) => yScale(point.value))
      .curve(curveMonotoneX)(points) ?? "";

  return (
    <g>
      <text fill="#6f7f75" fontSize="14" fontWeight="800" x="38" y="44">
        TIMELINE CONTRACT
      </text>
      <path d={path} fill="none" stroke="#2f6d3b" strokeLinecap="round" strokeWidth="7" />
      <path d={path} fill="none" stroke="#d7b36f" opacity="0.32" strokeLinecap="round" strokeWidth="16" />
      {points.slice(0, 6).map((point, index) => {
        const x = xScale(point.label) ?? 0;
        const y = yScale(point.value);

        return (
          <g key={point.label}>
            <rect
              fill="url(#d3-preview-card)"
              filter="url(#d3-preview-shadow)"
              height="54"
              rx="12"
              width="104"
              x={x - 52}
              y={index % 2 === 0 ? y + 28 : y - 82}
            />
            <circle cx={x} cy={y} fill={index === 0 ? "#2f6d3b" : "#d7b36f"} r="14" stroke="#ffffff" strokeWidth="5" />
            <text
              fill="#17352f"
              fontSize="13"
              fontWeight="900"
              textAnchor="middle"
              x={x}
              y={index % 2 === 0 ? y + 60 : y - 50}
            >
              {shortLabel(point.label, 12)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function DistributionPreview({ points }: { points: PreviewPoint[] }) {
  const maxValue = Math.max(max(points, (point) => point.value) ?? 1, 1);
  const widthScale = scaleLinear().domain([0, maxValue]).range([70, 360]);

  return (
    <g transform="translate(50 56)">
      <text fill="#6f7f75" fontSize="14" fontWeight="800" x="0" y="-18">
        DISTRIBUTION
      </text>
      {points.slice(0, 5).map((point, index) => {
        const y = index * 48;
        const barWidth = widthScale(point.value);
        const percent = Math.round((point.value / maxValue) * 100);

        return (
          <g key={point.label} transform={`translate(0 ${y})`}>
            <text fill="#17352f" fontSize="15" fontWeight="900" x="0" y="15">
              {shortLabel(point.label, 18)}
            </text>
            <rect fill="#e6ecdf" height="20" rx="10" width="380" x="120" y="0" />
            <rect
              fill={index % 2 === 0 ? "#2f6d3b" : "#d7b36f"}
              height="20"
              rx="10"
              width={barWidth}
              x="120"
              y="0"
            />
            <text fill="#53665c" fontSize="13" fontWeight="900" textAnchor="end" x="538" y="15">
              {percent}%
            </text>
          </g>
        );
      })}
    </g>
  );
}

function RelationshipPreview({ data }: { data: RelationshipData }) {
  const nodes = data.nodes.slice(0, 6);
  const primary = nodes[0] ?? "Core";
  const slots = [
    { x: 44, y: 80, anchorX: 170, anchorY: 110 },
    { x: 386, y: 80, anchorX: 386, anchorY: 110 },
    { x: 44, y: 204, anchorX: 170, anchorY: 234 },
    { x: 386, y: 204, anchorX: 386, anchorY: 234 },
    { x: 216, y: 260, anchorX: 278, anchorY: 260 }
  ];
  const hub = { x: 280, y: 162 };
  const positions = new Map<string, { x: number; y: number; anchorX: number; anchorY: number }>();
  positions.set(primary, { x: 210, y: 126, anchorX: hub.x, anchorY: hub.y });
  nodes.slice(1).forEach((node, index) => {
    const slot = slots[index] ?? slots[slots.length - 1]!;
    positions.set(node, slot);
  });
  const visibleLinks = data.links
    .filter(([source, target]) => positions.has(source) && positions.has(target))
    .slice(0, 9);
  const fallbackLinks = nodes
    .slice(1)
    .map((node) => [primary, node] as [string, string])
    .slice(0, 5);
  const links = visibleLinks.length > 0 ? visibleLinks : fallbackLinks;

  return (
    <g>
      <text fill="#6f7f75" fontSize="14" fontWeight="800" x="38" y="42">
        RELATIONSHIP MAP
      </text>
      <circle cx={hub.x} cy={hub.y} fill="#e8efe5" r="96" />
      <circle cx={hub.x} cy={hub.y} fill="none" opacity="0.65" r="116" stroke="#dbe6d8" strokeDasharray="6 10" strokeWidth="3" />
      {links.map(([source, target], index) => {
        const start = positions.get(source);
        const end = positions.get(target);

        if (!start || !end) {
          return null;
        }

        return (
          <path
            d={`M ${start.anchorX} ${start.anchorY} C ${hub.x} ${start.anchorY}, ${hub.x} ${end.anchorY}, ${end.anchorX} ${end.anchorY}`}
            fill="none"
            key={`${source}-${target}-${index}`}
            markerEnd="url(#d3-preview-arrow)"
            opacity="0.82"
            stroke="#8fa698"
            strokeLinecap="round"
            strokeWidth="4"
          />
        );
      })}
      <NodeCard
        accent="#2f6d3b"
        height={72}
        label={primary}
        subtitle="core"
        width={140}
        x={210}
        y={126}
      />
      {nodes.slice(1).map((node, index) => {
        const slot = positions.get(node) ?? slots[0]!;

        return (
          <NodeCard
            accent={index % 2 === 0 ? "#d7b36f" : "#c89437"}
            key={node}
            label={node}
            subtitle={`node ${index + 1}`}
            x={slot.x}
            y={slot.y}
          />
        );
      })}
    </g>
  );
}

function NodeCard({
  accent,
  height = 60,
  label,
  subtitle,
  width = 128,
  x,
  y
}: {
  accent: string;
  height?: number;
  label: string;
  subtitle: string;
  width?: number;
  x: number;
  y: number;
}) {
  return (
    <g filter="url(#d3-preview-shadow)">
      <rect fill="url(#d3-preview-card)" height={height} rx="14" width={width} x={x} y={y} />
      <rect fill={accent} height={height} rx="14" width="8" x={x} y={y} />
      <text fill="#17352f" fontSize="15" fontWeight="900" x={x + 18} y={y + 28}>
        {shortLabel(label, 12)}
      </text>
      <text fill="#6f7f75" fontSize="11" fontWeight="800" x={x + 18} y={y + 48}>
        {subtitle}
      </text>
    </g>
  );
}

function TreePreview({ data }: { data: TreeData }) {
  const rootData: TreeNodeData = {
    name: data.root,
    children: data.children.slice(0, 5).map((name) => ({ name }))
  };
  const root = hierarchy<TreeNodeData>(rootData);
  const layout = d3Tree<TreeNodeData>().size([430, 168])(root);

  return (
    <g transform="translate(64 70)">
      <text fill="#6f7f75" fontSize="14" fontWeight="800" x="-26" y="-28">
        TEACHING TREE
      </text>
      {layout.links().map((link) => (
        <path
          d={`M ${link.source.x} ${link.source.y} C ${link.source.x} ${(link.source.y + link.target.y) / 2}, ${link.target.x} ${(link.source.y + link.target.y) / 2}, ${link.target.x} ${link.target.y}`}
          fill="none"
          key={`${link.source.data.name}-${link.target.data.name}`}
          stroke="#9fb3a2"
          strokeLinecap="round"
          strokeWidth="5"
        />
      ))}
      {layout.descendants().map((node) => (
        <g filter="url(#d3-preview-shadow)" key={node.data.name} transform={`translate(${node.x} ${node.y})`}>
          <rect
            fill={node.depth === 0 ? "#2f6d3b" : "url(#d3-preview-card)"}
            height={node.depth === 0 ? 56 : 46}
            rx="12"
            width={node.depth === 0 ? 132 : 112}
            x={node.depth === 0 ? -66 : -56}
            y={node.depth === 0 ? -28 : -23}
          />
          <text
            fill={node.depth === 0 ? "#ffffff" : "#17352f"}
            fontSize={node.depth === 0 ? 14 : 12}
            fontWeight="900"
            textAnchor="middle"
            y="5"
          >
            {shortLabel(node.data.name, node.depth === 0 ? 13 : 11)}
          </text>
        </g>
      ))}
    </g>
  );
}

function VisualPreviewEmpty({ label }: { label: string }) {
  return <div className="visual-preview-empty">{label}</div>;
}

function buildD3Preview(diagram: string, dataJson: string) {
  const parsed = parseVisualDataJson(dataJson);

  if (!parsed.ok) {
    return {
      ok: false as const,
      label: parsed.error === "empty" ? "No preview data" : "Invalid JSON"
    };
  }

  return {
    ok: true as const,
    data: parsed.value,
    diagram: normalizeD3Diagram(diagram)
  };
}

function buildThreePreview(scene: string, dataJson: string, accentColor: string, speed: number) {
  const parsed = parseVisualDataJson(dataJson);

  if (!parsed.ok) {
    return {
      ok: false as const,
      label: parsed.error === "empty" ? "No preview data" : "Invalid JSON"
    };
  }

  const record = recordData(parsed.value);
  const normalizedScene = normalizeThreeScene(scene);

  return {
    ok: true as const,
    data: {
      accentColor: stringData(record?.accentColor) ?? accentColor,
      focus: stringData(record?.focus) ?? (normalizedScene === "planet-focus" ? "Sun" : "Ascendant"),
      speed: numberData(record?.speed) ?? speed
    },
    scene: normalizedScene
  };
}

function timelinePoints(data: unknown): PreviewPoint[] {
  const events = recordData(data)?.events;

  if (!Array.isArray(events)) {
    return fallbackTimeline;
  }

  const points = events.flatMap((item, index) => {
    const record = recordData(item);
    const label = stringData(record?.label);

    return label ? [{ label, value: numberData(record?.value) ?? index }] : [];
  });

  return points.length > 0 ? points.slice(0, 6) : fallbackTimeline;
}

function distributionPoints(data: unknown): PreviewPoint[] {
  const values = recordData(data)?.values;

  if (!Array.isArray(values)) {
    return fallbackTimeline.slice(0, 3);
  }

  const points = values.flatMap((item) => {
    const record = recordData(item);
    const label = stringData(record?.label);
    const value = numberData(record?.value);

    return label && value !== undefined ? [{ label, value }] : [];
  });

  return points.length > 0 ? points.slice(0, 5) : fallbackTimeline.slice(0, 3);
}

function relationshipData(data: unknown): RelationshipData {
  const record = recordData(data);
  const fallbackLinks: Array<[string, string]> = [
    ["Birth", "Horizon"],
    ["Horizon", "Rising"],
    ["Rising", "Style"]
  ];
  const nodes = Array.isArray(record?.nodes)
    ? record.nodes.flatMap((node) => (typeof node === "string" ? [node] : []))
    : ["Birth", "Horizon", "Rising", "Style"];
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

  return { nodes: nodes.slice(0, 6), links: links.slice(0, 8) };
}

function treeData(data: unknown): TreeData {
  const record = recordData(data);
  const root = stringData(record?.root) ?? "Rising sign";
  const children = Array.isArray(record?.children)
    ? record.children.flatMap((child) => (typeof child === "string" ? [child] : []))
    : ["First impression", "Body language", "Reaction", "Style"];

  return { root, children };
}

function makeOrbitGroup(
  three: typeof import("three"),
  data: ThreePreviewData,
  scene: ThreeSceneKind
) {
  const group = new three.Group();
  const accent = new three.Color(data.accentColor);
  const coreMaterial = new three.MeshStandardMaterial({
    color: scene === "planet-focus" ? accent : "#fbfaf4",
    emissive: accent,
    emissiveIntensity: scene === "planet-focus" ? 0.28 : 0.08,
    roughness: 0.52
  });
  const coreGeometry = new three.SphereGeometry(scene === "planet-focus" ? 0.72 : 0.58, 48, 24);
  const core = new three.Mesh(coreGeometry, coreMaterial);
  group.add(core);

  const ringGeometry = new three.TorusGeometry(1.55, 0.012, 12, 96);
  const ringMaterial = new three.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.72 });
  const ring = new three.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = Math.PI / 2.7;
  group.add(ring);

  const secondRing = new three.Mesh(
    new three.TorusGeometry(scene === "zodiac-space" ? 2.05 : 1.08, 0.008, 12, 96),
    new three.MeshBasicMaterial({ color: "#fbfaf4", transparent: true, opacity: 0.34 })
  );
  secondRing.rotation.x = Math.PI / 2.15;
  secondRing.rotation.z = 0.48;
  group.add(secondRing);

  const satellite = new three.Mesh(
    new three.SphereGeometry(0.16, 24, 12),
    new three.MeshStandardMaterial({ color: accent, roughness: 0.38 })
  );
  satellite.position.set(1.55, 0, 0);
  group.add(satellite);

  return group;
}

function makeStarField(three: typeof import("three"), scene: ThreeSceneKind) {
  const group = new three.Group();
  const material = new three.MeshBasicMaterial({ color: "#fbfaf4", transparent: true, opacity: 0.72 });
  const geometry = new three.SphereGeometry(0.018, 8, 4);
  const count = scene === "zodiac-space" ? 48 : 28;

  for (let index = 0; index < count; index += 1) {
    const star = new three.Mesh(geometry, material);
    const angle = index * 2.399;
    const radius = 2.6 + (index % 7) * 0.28;
    star.position.set(Math.cos(angle) * radius, -1.5 + (index % 11) * 0.28, Math.sin(angle) * radius);
    group.add(star);
  }

  return group;
}

function disposeThreeObject(item: unknown) {
  const maybeMesh = item as {
    geometry?: { dispose?: () => void };
    material?: { dispose?: () => void } | Array<{ dispose?: () => void }>;
  };

  maybeMesh.geometry?.dispose?.();

  if (Array.isArray(maybeMesh.material)) {
    for (const material of maybeMesh.material) {
      material.dispose?.();
    }
  } else {
    maybeMesh.material?.dispose?.();
  }
}

function normalizeD3Diagram(value: string): D3DiagramKind {
  return value === "relationship" || value === "tree" || value === "distribution" ? value : "timeline";
}

function normalizeThreeScene(value: string): ThreeSceneKind {
  return value === "zodiac-space" || value === "planet-focus" ? value : "orbit";
}

function shortLabel(value: string, maxLength = 16) {
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
