import type {
  AstroChartHighlight,
  AstroChartHouse,
  AstroChartSceneSpec
} from "@zeroflow/core";
import type { CSSProperties } from "react";
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
const chartRadius = 490;
const chartTop = 250;
const astroChartSymbolScale = 1.2;
const astroChartPadding = 18;
const astroChartInnerCircleRadius = chartRadius / 2;
const astroChartSignsInnerRadius = chartRadius - chartRadius / 8;
const astroChartRulerRadius = (chartRadius / 8) / 4;
const planetHighlightRadius =
  chartRadius - (chartRadius / 8 + 2 * astroChartRulerRadius + astroChartPadding * astroChartSymbolScale);
const aspectHighlightRadius = astroChartInnerCircleRadius;
const houseOuterRadius = chartRadius;
const houseInnerRadius = astroChartInnerCircleRadius;
const axisHighlightRadius = chartRadius + (chartRadius / 8) / 4;

const planetFallbackLongitudes: Record<string, number> = {
  sun: 47,
  moon: 118,
  mercury: 62,
  venus: 204,
  mars: 290,
  jupiter: 315,
  saturn: 168,
  uranus: 12,
  neptune: 348,
  pluto: 268,
  chiron: 24,
  lilith: 252,
  nnode: 83,
  northnode: 83,
  truenode: 83,
  southnode: 263
};

const zodiacStartLongitudes: Record<string, number> = {
  aries: 0,
  baiyang: 0,
  白羊: 0,
  taurus: 30,
  jinniu: 30,
  金牛: 30,
  gemini: 60,
  shuangzi: 60,
  双子: 60,
  cancer: 90,
  juxie: 90,
  巨蟹: 90,
  leo: 120,
  shizi: 120,
  狮子: 120,
  virgo: 150,
  chunv: 150,
  处女: 150,
  libra: 180,
  tiancheng: 180,
  天秤: 180,
  scorpio: 210,
  tianxie: 210,
  天蝎: 210,
  sagittarius: 240,
  sheshou: 240,
  射手: 240,
  capricorn: 270,
  mojie: 270,
  摩羯: 270,
  aquarius: 300,
  shuiping: 300,
  水瓶: 300,
  pisces: 330,
  shuangyu: 330,
  双鱼: 330
};

const zodiacCanonicalTargetIds: Record<string, string> = {
  aries: "aries",
  baiyang: "aries",
  taurus: "taurus",
  jinniu: "taurus",
  gemini: "gemini",
  shuangzi: "gemini",
  cancer: "cancer",
  juxie: "cancer",
  leo: "leo",
  shizi: "leo",
  virgo: "virgo",
  chunv: "virgo",
  libra: "libra",
  tiancheng: "libra",
  scorpio: "scorpio",
  tianxie: "scorpio",
  sagittarius: "sagittarius",
  sheshou: "sagittarius",
  capricorn: "capricorn",
  mojie: "capricorn",
  aquarius: "aquarius",
  shuiping: "aquarius",
  pisces: "pisces",
  shuangyu: "pisces"
};

export function AstroChartScene({ scene }: { scene: AstroChartSceneSpec }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = interpolate(frame, [0, 32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic)
  });
  const ticks = Array.from({ length: 12 }, (_, index) => index);
  const aspectLines = [
    [0, 5],
    [2, 8],
    [3, 10],
    [6, 11],
    [1, 7]
  ] as const;
  const chartStyle: CSSProperties = {
    position: "absolute",
    left: 0,
    top: chartTop,
    width: 1080,
    height: 1080,
    opacity: reveal,
    transform: `scale(${0.9 + reveal * 0.1})`
  };
  const hasGeneratedChartVisual = Boolean(scene.chartSvg || scene.chartAssetUrl);
  const inlineChartId = safeSvgId(scene.id);

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background:
          "linear-gradient(180deg, #f7f1df 0%, #d7e5d8 54%, #24443e 100%)",
        color: "#102c2a"
      }}
    >
      {scene.chartSvg ? (
        <>
          <InlineAstroChartSvg
            alt={scene.title}
            chartDomId={inlineChartId}
            style={chartStyle}
            svg={scene.chartSvg}
          />
          <InlineAstroChartHighlightStyles
            chartDomId={inlineChartId}
            frame={frame}
            fps={fps}
            scene={scene}
          />
        </>
      ) : null}
      <svg
        viewBox="0 0 1080 1080"
        style={{
          ...chartStyle,
          display: hasGeneratedChartVisual ? "none" : undefined
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
      {!scene.chartSvg && scene.chartAssetUrl ? (
        <RemoteVisualAsset
          alt={scene.title}
          src={scene.chartAssetUrl}
          style={{
            ...chartStyle,
            objectFit: "contain"
          }}
        />
      ) : null}
      <AstroChartHighlightOverlay frame={frame} fps={fps} reveal={reveal} scene={scene} />
      <CaptionLayer caption={scene.caption} />
    </AbsoluteFill>
  );
}

function InlineAstroChartSvg({
  alt,
  chartDomId,
  style,
  svg
}: {
  alt: string;
  chartDomId: string;
  style: CSSProperties;
  svg: string;
}) {
  const safeSvg = sanitizeInlineSvg(svg);

  if (!safeSvg) {
    return null;
  }

  return (
    <div
      aria-label={alt}
      data-zeroflow-inline-chart={chartDomId}
      data-visual-asset="inline-astrochart"
      dangerouslySetInnerHTML={{ __html: safeSvg }}
      role="img"
      style={{
        ...style,
        overflow: "hidden"
      }}
    />
  );
}

function InlineAstroChartHighlightStyles({
  chartDomId,
  frame,
  fps,
  scene
}: {
  chartDomId: string;
  frame: number;
  fps: number;
  scene: AstroChartSceneSpec;
}) {
  const css = scene.highlights
    .map((highlight) => {
      const progress = highlightProgress(highlight, frame, fps);
      const selector = inlineHighlightSelector(highlight);

      if (progress <= 0 || !selector) {
        return "";
      }

      return inlineHighlightCss(chartDomId, selector, highlight, progress);
    })
    .filter(Boolean)
    .join("\n");

  return css ? <style>{css}</style> : null;
}

function sanitizeInlineSvg(svg: string) {
  const trimmed = svg.trim();

  if (!trimmed.toLowerCase().startsWith("<svg")) {
    return "";
  }

  return trimmed
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:href|xlink:href)\s*=\s*(['"])\s*(?:javascript|data:text\/html)[\s\S]*?\1/gi, "");
}

function inlineHighlightSelector(highlight: AstroChartHighlight) {
  if (highlight.kind === "aspect") {
    const [fromId, toId] = aspectTargets(highlight);
    const fromTargets = inlinePlanetTargetIds(fromId);
    const toTargets = toId ? inlinePlanetTargetIds(toId) : [];

    if (fromTargets.length > 0 && toTargets.length > 0) {
      return fromTargets
        .flatMap((from) =>
          toTargets.flatMap((to) => [
            inlineTargetSelector("aspect", `[data-zeroflow-chart-from="${cssAttr(from)}"][data-zeroflow-chart-to="${cssAttr(to)}"]`),
            inlineTargetSelector("aspect", `[data-zeroflow-chart-from="${cssAttr(to)}"][data-zeroflow-chart-to="${cssAttr(from)}"]`)
          ])
        )
        .join(", ");
    }

    const aspectName = normalizeAspectName(highlight.id);
    return aspectName
      ? inlineTargetSelector("aspect", `[data-zeroflow-chart-aspect="${cssAttr(aspectName)}"]`)
      : undefined;
  }

  if (highlight.kind === "house") {
    const houseNumber = houseNumberFromId(highlight.id);
    return houseNumber
      ? inlineTargetSelector("house", `[data-zeroflow-chart-house="${houseNumber}"]`)
      : undefined;
  }

  if (highlight.kind === "zodiac") {
    const zodiac = resolveZodiacSector(highlight.id);
    return zodiac
      ? inlineTargetSelector("zodiac", `[data-zeroflow-chart-target="${cssAttr(zodiac.targetId)}"]`)
      : undefined;
  }

  if (highlight.kind === "axis") {
    const axis = normalizedAxisTargetId(highlight.id);
    return axis
      ? inlineTargetSelector("axis", `[data-zeroflow-chart-target="${cssAttr(axis)}"]`)
      : undefined;
  }

  const targets = inlinePlanetTargetIds(highlight.id);
  return targets.length > 0
    ? targets
        .map((target) => inlineTargetSelector("planet", `[data-zeroflow-chart-target="${cssAttr(target)}"]`))
        .join(", ")
    : undefined;
}

function inlineHighlightCss(
  chartDomId: string,
  selector: string,
  highlight: AstroChartHighlight,
  progress: number
) {
  const scopedSelector = selector
    .split(",")
    .map((item) => `[data-zeroflow-inline-chart="${cssAttr(chartDomId)}"] ${item.trim()}`)
    .join(", ");
  const color = cssColor(highlight.color);
  const emphasis = Math.max(0.4, highlight.emphasis);
  const glow = Math.round(8 + emphasis * 10);
  const strokeWidth = (2.5 + emphasis * 2.8).toFixed(2);
  const strongOpacity = (0.32 + progress * 0.68).toFixed(3);

  if (highlight.kind === "house" || highlight.kind === "zodiac") {
    const fillOpacity = (0.08 + progress * 0.12).toFixed(3);
    return `
${scopedSelector} {
  fill: ${color} !important;
  fill-opacity: ${fillOpacity} !important;
  stroke: ${color} !important;
  stroke-opacity: ${strongOpacity} !important;
  stroke-width: ${strokeWidth} !important;
  opacity: 1 !important;
  filter: drop-shadow(0 0 ${glow}px ${color});
}`;
  }

  if (highlight.kind === "aspect" || highlight.kind === "axis") {
    return `
${scopedSelector} {
  stroke: ${color} !important;
  stroke-opacity: ${strongOpacity} !important;
  stroke-width: ${(4 + emphasis * 3.2).toFixed(2)} !important;
  opacity: 1 !important;
  filter: drop-shadow(0 0 ${glow}px ${color});
}`;
  }

  return `
${scopedSelector},
${scopedSelector} * {
  stroke: ${color} !important;
  stroke-opacity: ${strongOpacity} !important;
  stroke-width: ${strokeWidth} !important;
  opacity: 1 !important;
  filter: drop-shadow(0 0 ${glow}px ${color});
}`;
}

function inlineTargetSelector(kind: AstroChartHighlight["kind"], suffix: string) {
  return `[data-zeroflow-chart-element="${kind}"]${suffix}`;
}

function inlinePlanetTargetIds(id: string) {
  const normalized = normalizeTargetId(id);
  const aliases = new Set([normalized, ...planetAliases(normalized)]);

  if (["northnode", "nnode", "meannode", "truenode"].includes(normalized)) {
    ["northnode", "nnode", "meannode", "truenode"].forEach((alias) => aliases.add(alias));
  }

  if (["southnode", "snode"].includes(normalized)) {
    ["southnode", "snode"].forEach((alias) => aliases.add(alias));
  }

  return Array.from(aliases).filter(Boolean);
}

function normalizedAxisTargetId(id: string) {
  const normalized = normalizeTargetId(id);
  const axisAliases: Record<string, string> = {
    asc: "ascendant",
    as: "ascendant",
    ascendant: "ascendant",
    desc: "descendant",
    dsc: "descendant",
    ds: "descendant",
    descendant: "descendant",
    mc: "mc",
    midheaven: "mc",
    ic: "ic"
  };

  return axisAliases[normalized];
}

function normalizeAspectName(id: string) {
  const normalized = normalizeTargetId(id);
  return ["conjunction", "opposition", "square", "trine"].includes(normalized)
    ? normalized
    : undefined;
}

function cssAttr(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function cssColor(value: string) {
  return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value) ? value : "#e05f45";
}

function AstroChartHighlightOverlay({
  frame,
  fps,
  reveal,
  scene
}: {
  frame: number;
  fps: number;
  reveal: number;
  scene: AstroChartSceneSpec;
}) {
  if (scene.highlights.length === 0) {
    return null;
  }

  const glowId = `astro-highlight-glow-${safeSvgId(scene.id)}`;

  return (
    <svg
      viewBox="0 0 1080 1080"
      style={{
        position: "absolute",
        left: 0,
        top: chartTop,
        zIndex: 4,
        width: 1080,
        height: 1080,
        opacity: reveal,
        pointerEvents: "none",
        transform: `scale(${0.9 + reveal * 0.1})`
      }}
    >
      <defs>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="10" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {scene.highlights.map((highlight, index) => {
        const progress = highlightProgress(highlight, frame, fps);

        if (progress <= 0) {
          return null;
        }

        return (
          <HighlightShape
            glowId={glowId}
            highlight={highlight}
            key={`${highlight.kind}-${highlight.id}-${highlight.targetId ?? "single"}-${index}`}
            progress={progress}
            scene={scene}
            frame={frame}
            fps={fps}
          />
        );
      })}
    </svg>
  );
}

function HighlightShape({
  glowId,
  highlight,
  progress,
  scene,
  frame,
  fps
}: {
  glowId: string;
  highlight: AstroChartHighlight;
  progress: number;
  scene: AstroChartSceneSpec;
  frame: number;
  fps: number;
}) {
  const color = highlight.color;
  const emphasis = Math.max(0.4, highlight.emphasis);
  const strokeWidth = 5 + emphasis * 4;
  const pulse = highlight.style === "pulse" ? 1 + Math.sin((frame - highlight.startSec * fps) / 4) * 0.075 : 1;
  const opacity = 0.18 + progress * 0.82;

  if (highlight.kind === "aspect") {
    const [fromId, toId] = aspectTargets(highlight);
    const from = resolvePlanetPoint(fromId, scene, aspectHighlightRadius);
    const to = toId ? resolvePlanetPoint(toId, scene, aspectHighlightRadius) : undefined;

    if (!from || !to) {
      return null;
    }

    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };

    return (
      <g opacity={opacity}>
        <line
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          stroke={color}
          strokeLinecap="round"
          strokeOpacity={0.24 * progress}
          strokeWidth={strokeWidth + 14}
        />
        <line
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          stroke={color}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
          filter={`url(#${glowId})`}
        />
        {renderHighlightLabel(highlight.label, mid, color, progress)}
      </g>
    );
  }

  if (highlight.kind === "house") {
    const house = resolveHouseSector(highlight.id, scene.houses);

    if (!house) {
      return null;
    }

    const labelPoint = pointForLongitude(house.midLongitude, axisHighlightRadius + 42, scene);

    return (
      <g opacity={opacity}>
        <path d={describeSector(house.startLongitude, house.endLongitude, houseInnerRadius, houseOuterRadius, scene)} fill={color} fillOpacity={0.16 * progress} />
        <path d={describeSector(house.startLongitude, house.endLongitude, houseInnerRadius, houseOuterRadius, scene)} fill="none" stroke={color} strokeOpacity={0.75 * progress} strokeWidth={strokeWidth} />
        {renderHighlightLabel(highlight.label ?? `H${house.house}`, labelPoint, color, progress)}
      </g>
    );
  }

  if (highlight.kind === "zodiac") {
    const zodiac = resolveZodiacSector(highlight.id);

    if (!zodiac) {
      return null;
    }

    const labelPoint = pointForLongitude(zodiac.startLongitude + 15, chartRadius - 30, scene);

    return (
      <g opacity={opacity}>
        <path d={describeSector(zodiac.startLongitude, zodiac.startLongitude + 30, astroChartSignsInnerRadius, chartRadius, scene)} fill={color} fillOpacity={0.14 * progress} />
        <path d={describeSector(zodiac.startLongitude, zodiac.startLongitude + 30, astroChartSignsInnerRadius, chartRadius, scene)} fill="none" stroke={color} strokeOpacity={0.72 * progress} strokeWidth={strokeWidth} />
        {renderHighlightLabel(highlight.label ?? highlight.id, labelPoint, color, progress)}
      </g>
    );
  }

  if (highlight.kind === "axis") {
    const axis = resolveAxisLine(highlight.id, scene);

    if (!axis) {
      return null;
    }

    return (
      <g opacity={opacity}>
        <line
          x1={axis.from.x}
          y1={axis.from.y}
          x2={axis.to.x}
          y2={axis.to.y}
          stroke={color}
          strokeLinecap="round"
          strokeOpacity={0.22 * progress}
          strokeWidth={strokeWidth + 18}
        />
        <line
          x1={axis.from.x}
          y1={axis.from.y}
          x2={axis.to.x}
          y2={axis.to.y}
          stroke={color}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
          filter={`url(#${glowId})`}
        />
        <circle cx={axis.focus.x} cy={axis.focus.y} r={(22 + emphasis * 7) * pulse} fill="none" stroke={color} strokeWidth={strokeWidth} />
        {renderHighlightLabel(highlight.label ?? axis.label, axis.labelPoint, color, progress)}
      </g>
    );
  }

  const point = resolvePlanetPoint(highlight.id, scene);

  if (!point) {
    return null;
  }

  return (
    <g opacity={opacity}>
      <circle
        cx={point.x}
        cy={point.y}
        r={(34 + emphasis * 10) * pulse}
        fill={color}
        fillOpacity={0.12 * progress}
      />
      <circle
        cx={point.x}
        cy={point.y}
        r={(26 + emphasis * 8) * pulse}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        filter={`url(#${glowId})`}
      />
      {renderHighlightLabel(highlight.label ?? point.label, pointForLongitude(point.longitude, planetHighlightRadius + 62, scene), color, progress)}
    </g>
  );
}

function highlightProgress(highlight: AstroChartHighlight, frame: number, fps: number) {
  const startFrame = highlight.startSec * fps;
  const endFrame = (highlight.startSec + highlight.durationSec) * fps;

  if (frame < startFrame || frame > endFrame) {
    return 0;
  }

  const fadeFrames = Math.max(1, Math.min(10, (endFrame - startFrame) / 3));
  const enter = interpolate(frame, [startFrame, startFrame + fadeFrames], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const exit = interpolate(frame, [endFrame - fadeFrames, endFrame], [1, 0], {
    easing: Easing.in(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return Math.min(enter, exit);
}

function resolvePlanetPoint(
  id: string,
  scene: AstroChartSceneSpec,
  radius = planetHighlightRadius
) {
  const normalized = normalizeTargetId(id);
  const position = scene.positions.find(
    (item) => normalizeTargetId(item.id) === normalized || planetAliases(item.id).includes(normalized)
  );
  const longitude =
    position?.longitude ??
    (normalized === "southnode" && scene.positions.some((item) => planetAliases(item.id).includes("northnode"))
      ? normalizeDegrees(
          (scene.positions.find((item) => planetAliases(item.id).includes("northnode"))?.longitude ?? 0) + 180
        )
      : planetFallbackLongitudes[normalized]);

  if (longitude === undefined) {
    return undefined;
  }

  return {
    ...pointForLongitude(longitude, radius, scene),
    label: position?.id ?? id,
    longitude
  };
}

function resolveAxisLine(id: string, scene: AstroChartSceneSpec) {
  const normalized = normalizeTargetId(id);
  const ascendant = scene.calculation?.ascendant ?? houseLongitude(scene.houses, 1);
  const axisLongitudes: Record<string, number | undefined> = {
    asc: ascendant,
    ascendant,
    desc: ascendant === undefined ? undefined : normalizeDegrees(ascendant + 180),
    descendant: ascendant === undefined ? undefined : normalizeDegrees(ascendant + 180),
    mc: houseLongitude(scene.houses, 10),
    midheaven: houseLongitude(scene.houses, 10),
    ic: houseLongitude(scene.houses, 4)
  };
  const fallbackAngles: Record<string, number> = {
    asc: 180,
    ascendant: 180,
    desc: 0,
    descendant: 0,
    mc: -90,
    midheaven: -90,
    ic: 90
  };
  const longitude = axisLongitudes[normalized];
  const angle = longitude === undefined ? fallbackAngles[normalized] : longitudeToAngle(longitude, scene);

  if (angle === undefined) {
    return undefined;
  }

  const from = polar(chartCenter, chartCenter, axisHighlightRadius, angle);
  const to = polar(chartCenter, chartCenter, axisHighlightRadius, angle + 180);
  const focus = from;
  const labelPoint = polar(chartCenter, chartCenter, axisHighlightRadius + 42, angle);

  return {
    focus,
    from,
    label: axisLabel(normalized),
    labelPoint,
    to
  };
}

function resolveHouseSector(id: string, houses: AstroChartHouse[]) {
  const houseNumber = houseNumberFromId(id);

  if (!houseNumber) {
    return undefined;
  }

  const house = houses.find((item) => item.house === houseNumber);
  const nextHouse = houses.find((item) => item.house === (houseNumber === 12 ? 1 : houseNumber + 1));
  const startLongitude = house?.longitude ?? (houseNumber - 1) * 30;
  const endLongitude = nextHouse?.longitude ?? houseNumber * 30;
  const span = positiveLongitudeSpan(startLongitude, endLongitude);

  return {
    house: houseNumber,
    startLongitude,
    endLongitude: startLongitude + span,
    midLongitude: startLongitude + span / 2
  };
}

function resolveZodiacSector(id: string) {
  const normalized = normalizeTargetId(id).replace(/座$/u, "");
  const startLongitude = zodiacStartLongitudes[normalized];

  return startLongitude === undefined
    ? undefined
    : {
        startLongitude,
        targetId: zodiacCanonicalTargetIds[normalized] ?? normalized
      };
}

function aspectTargets(highlight: AstroChartHighlight): [string, string | undefined] {
  if (highlight.targetId) {
    return [highlight.id, highlight.targetId];
  }

  const parts = highlight.id.split(/(?:\s+to\s+|[-_:>]+)/i).filter(Boolean);
  return [parts[0] ?? highlight.id, parts[1]];
}

function renderHighlightLabel(
  label: string | undefined,
  point: { x: number; y: number },
  color: string,
  progress: number
) {
  if (!label) {
    return null;
  }

  const width = Math.min(240, Math.max(96, label.length * 28 + 42));
  const x = clamp(point.x, width / 2 + 8, 1080 - width / 2 - 8);
  const y = clamp(point.y, 32, 1080 - 32);

  return (
    <g opacity={progress}>
      <rect
        x={x - width / 2}
        y={y - 24}
        width={width}
        height={48}
        rx={8}
        fill="#fbfaf4"
        stroke={color}
        strokeWidth={3}
      />
      <text
        x={x}
        y={y + 1}
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        fontSize={24}
        fontWeight={900}
      >
        {label}
      </text>
    </g>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function polar(cx: number, cy: number, radius: number, angleDeg: number) {
  const angle = (angleDeg * Math.PI) / 180;

  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle)
  };
}

function pointForLongitude(longitude: number, radius: number, scene: AstroChartSceneSpec) {
  return polar(chartCenter, chartCenter, radius, longitudeToAngle(longitude, scene));
}

function longitudeToAngle(longitude: number, scene: AstroChartSceneSpec) {
  return 180 - (normalizeDegrees(longitude) + astroChartShiftDegrees(scene));
}

function describeSector(
  startLongitude: number,
  endLongitude: number,
  innerRadius: number,
  outerRadius: number,
  scene: AstroChartSceneSpec
) {
  const start = startLongitude;
  const end = startLongitude + positiveLongitudeSpan(startLongitude, endLongitude);
  const outerStart = pointForLongitude(start, outerRadius, scene);
  const outerEnd = pointForLongitude(end, outerRadius, scene);
  const innerEnd = pointForLongitude(end, innerRadius, scene);
  const innerStart = pointForLongitude(start, innerRadius, scene);
  const largeArc = end - start > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 0 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${innerStart.x} ${innerStart.y}`,
    "Z"
  ].join(" ");
}

function astroChartShiftDegrees(scene: AstroChartSceneSpec) {
  const ascendant = scene.calculation?.ascendant ?? houseLongitude(scene.houses, 1);
  return ascendant === undefined ? 0 : 360 - normalizeDegrees(ascendant);
}

function positiveLongitudeSpan(startLongitude: number, endLongitude: number) {
  const start = normalizeDegrees(startLongitude);
  let end = normalizeDegrees(endLongitude);

  if (end <= start) {
    end += 360;
  }

  return end - start;
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function normalizeTargetId(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/星座$/u, "")
    .replace(/座$/u, "");
}

function planetAliases(id: string) {
  const normalized = normalizeTargetId(id);
  const aliases: Record<string, string[]> = {
    nnode: ["nnode", "northnode", "meannode"],
    truenode: ["truenode", "northnode"],
    lilith: ["lilith", "meanapogee"]
  };

  return aliases[normalized] ?? [normalized];
}

function houseNumberFromId(id: string) {
  const normalized = normalizeTargetId(id);
  const match = normalized.match(/^(?:house|h)?(\d{1,2})$/);
  const houseNumber = match ? Number(match[1]) : Number.NaN;

  return houseNumber >= 1 && houseNumber <= 12 ? houseNumber : undefined;
}

function houseLongitude(houses: AstroChartHouse[], house: number) {
  return houses.find((item) => item.house === house)?.longitude;
}

function axisLabel(id: string) {
  if (id === "desc" || id === "descendant") {
    return "DSC";
  }

  if (id === "mc" || id === "midheaven") {
    return "MC";
  }

  if (id === "ic") {
    return "IC";
  }

  return "ASC";
}

function safeSvgId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}
