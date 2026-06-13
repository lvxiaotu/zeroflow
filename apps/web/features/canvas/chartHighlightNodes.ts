import type { CanvasDocument, CanvasNode } from "@zeroflow/core";

export const chartHighlightKindOptions = [
  { value: "axis", label: "轴点" },
  { value: "planet", label: "行星" },
  { value: "house", label: "宫位" },
  { value: "aspect", label: "相位" },
  { value: "zodiac", label: "星座" }
] as const;

export const chartHighlightStyleOptions = [
  { value: "pulse", label: "脉冲" },
  { value: "glow", label: "发光" },
  { value: "ring", label: "圆环" },
  { value: "line", label: "连线" },
  { value: "sector", label: "扇区" },
  { value: "label", label: "标签" }
] as const;

export type ChartHighlightDataKey =
  | "title"
  | "description"
  | "highlightKind"
  | "targetId"
  | "secondaryTargetId"
  | "label"
  | "style"
  | "color"
  | "emphasis"
  | "startSec"
  | "durationSec";

export type ChartHighlightKindValue = (typeof chartHighlightKindOptions)[number]["value"];
export type ChartHighlightDataValue = string | number;
export type ChartHighlightDataPatch = Partial<Record<ChartHighlightDataKey, ChartHighlightDataValue>>;

export type ChartHighlightTargetOption = {
  kind: ChartHighlightKindValue;
  value: string;
  targetId: string;
  secondaryTargetId?: string;
  label: string;
  detail?: string;
};

type ChartPosition = {
  id: string;
  longitude: number;
  sign?: string;
  degreeInSign?: number;
};

type ChartHouse = {
  house: number;
  longitude: number;
  sign?: string;
  degreeInSign?: number;
};

const defaultPlanetTargets = [
  { id: "sun", label: "太阳" },
  { id: "moon", label: "月亮" },
  { id: "mercury", label: "水星" },
  { id: "venus", label: "金星" },
  { id: "mars", label: "火星" },
  { id: "jupiter", label: "木星" },
  { id: "saturn", label: "土星" },
  { id: "uranus", label: "天王星" },
  { id: "neptune", label: "海王星" },
  { id: "pluto", label: "冥王星" },
  { id: "chiron", label: "凯龙星" },
  { id: "northnode", label: "北交点" },
  { id: "southnode", label: "南交点" },
  { id: "lilith", label: "莉莉丝" }
] as const;

const zodiacTargets = [
  { id: "aries", label: "白羊座" },
  { id: "taurus", label: "金牛座" },
  { id: "gemini", label: "双子座" },
  { id: "cancer", label: "巨蟹座" },
  { id: "leo", label: "狮子座" },
  { id: "virgo", label: "处女座" },
  { id: "libra", label: "天秤座" },
  { id: "scorpio", label: "天蝎座" },
  { id: "sagittarius", label: "射手座" },
  { id: "capricorn", label: "摩羯座" },
  { id: "aquarius", label: "水瓶座" },
  { id: "pisces", label: "双鱼座" }
] as const;

const axisTargets = [
  { id: "ascendant", label: "上升点 ASC", house: 1 },
  { id: "descendant", label: "下降点 DSC", house: 7 },
  { id: "mc", label: "天顶 MC", house: 10 },
  { id: "ic", label: "天底 IC", house: 4 }
] as const;

const majorAspectDefinitions = [
  { id: "conjunction", label: "合相", degree: 0, orb: 10 },
  { id: "opposition", label: "对冲", degree: 180, orb: 10 },
  { id: "square", label: "四分相", degree: 90, orb: 8 },
  { id: "trine", label: "三分相", degree: 120, orb: 8 }
] as const;

export function getChartHighlightTargetOptions(
  chartNode: CanvasNode,
  kind: string
): ChartHighlightTargetOption[] {
  const normalizedKind = normalizeChartHighlightKind(kind);

  if (normalizedKind === "planet") {
    return planetTargetOptions(chartNode);
  }

  if (normalizedKind === "house") {
    return houseTargetOptions(chartNode);
  }

  if (normalizedKind === "aspect") {
    return aspectTargetOptions(chartNode);
  }

  if (normalizedKind === "zodiac") {
    return zodiacTargets.map((target) => ({
      kind: "zodiac",
      value: target.id,
      targetId: target.id,
      label: target.label
    }));
  }

  return axisTargetOptions(chartNode);
}

export function getChartHighlightTargetOptionValue(option: ChartHighlightTargetOption) {
  return option.secondaryTargetId ? `${option.targetId}=>${option.secondaryTargetId}` : option.targetId;
}

export function findChartHighlightTargetOption(
  options: ChartHighlightTargetOption[],
  targetId: string,
  secondaryTargetId?: string
) {
  const normalizedTargetId = normalizeTargetId(targetId);
  const normalizedSecondaryTargetId = normalizeTargetId(secondaryTargetId ?? "");

  return options.find(
    (option) =>
      normalizeTargetId(option.targetId) === normalizedTargetId &&
      normalizeTargetId(option.secondaryTargetId ?? "") === normalizedSecondaryTargetId
  );
}

export function getChartHighlightNodes(canvas: CanvasDocument, chartNode: CanvasNode) {
  const chartIds = compactStringSet([chartNode.id, chartNode.refId]);
  const linkedHighlightIds = new Set(
    canvas.edges.flatMap((edge) => {
      if (edge.fromNodeId === chartNode.id) {
        return [edge.toNodeId];
      }

      if (edge.toNodeId === chartNode.id) {
        return [edge.fromNodeId];
      }

      return [];
    })
  );

  return canvas.nodes
    .filter(
      (node) =>
        node.kind === "chart-highlight" &&
        (linkedHighlightIds.has(node.id) ||
          [
            stringData(node.data.chartId),
            stringData(node.data.chartNodeId),
            stringData(node.data.sourceChartNodeId),
            stringData(node.data.parentNodeId)
          ].some((id) => id !== undefined && chartIds.has(id)))
    )
    .sort(compareChartHighlightNodes);
}

export function getChartHighlightSourceChart(
  canvas: CanvasDocument,
  highlightNode: CanvasNode
) {
  if (highlightNode.kind !== "chart-highlight") {
    return undefined;
  }

  const linkedChartIds = new Set(
    canvas.edges.flatMap((edge) => {
      if (edge.fromNodeId === highlightNode.id) {
        return [edge.toNodeId];
      }

      if (edge.toNodeId === highlightNode.id) {
        return [edge.fromNodeId];
      }

      return [];
    })
  );
  const chartRefs = compactStringSet([
    stringData(highlightNode.data.chartId),
    stringData(highlightNode.data.chartNodeId),
    stringData(highlightNode.data.sourceChartNodeId),
    stringData(highlightNode.data.parentNodeId)
  ]);

  return canvas.nodes.find(
    (node) =>
      node.kind === "chart" &&
      (linkedChartIds.has(node.id) ||
        [node.id, node.refId].some((id) => id !== undefined && chartRefs.has(id)))
  );
}

export function createChartHighlightChild(
  canvas: CanvasDocument,
  chartNode: CanvasNode
): { canvas: CanvasDocument; nodeId: string } {
  const existing = getChartHighlightNodes(canvas, chartNode);
  const index = existing.length + 1;
  const nodeId = uniqueCanvasId(canvas, `node-chart-highlight-${safeId(chartNode.id)}-${index}`);
  const edgeId = uniqueCanvasId(canvas, `edge-${safeId(chartNode.id)}-${safeId(nodeId)}`);
  const chartRef = chartNode.refId ?? chartNode.id;
  const node: CanvasNode = {
    id: nodeId,
    kind: "chart-highlight",
    refId: `chart-highlight-${safeId(chartRef)}-${index}`,
    position: {
      x: chartNode.position.x + chartNode.size.width + 48,
      y: chartNode.position.y + (index - 1) * 132
    },
    size: { width: 280, height: 170 },
    status: "ready",
    data: {
      title: `高亮 ${index}`,
      description: "讲解到这里时高亮星盘元素",
      chartId: chartRef,
      chartNodeId: chartNode.id,
      parentNodeId: chartNode.id,
      highlightKind: "axis",
      targetId: "ascendant",
      label: "上升点",
      startSec: Math.max(0, (index - 1) * 2),
      durationSec: 1.8,
      style: "pulse",
      color: "#e05f45",
      emphasis: 1
    }
  };

  return {
    nodeId,
    canvas: {
      ...canvas,
      nodes: [...canvas.nodes, node],
      edges: [
        ...canvas.edges,
        {
          id: edgeId,
          fromNodeId: chartNode.id,
          toNodeId: nodeId,
          relation: "uses"
        }
      ]
    }
  };
}

export function updateChartHighlightChild(
  canvas: CanvasDocument,
  nodeId: string,
  patch: ChartHighlightDataPatch
): CanvasDocument {
  return {
    ...canvas,
    nodes: canvas.nodes.map((node) =>
      node.id === nodeId
        ? {
            ...node,
            data: {
              ...node.data,
              ...patch
            }
          }
        : node
    )
  };
}

export function removeChartHighlightChild(canvas: CanvasDocument, nodeId: string): CanvasDocument {
  return {
    ...canvas,
    nodes: canvas.nodes.filter((node) => node.id !== nodeId),
    edges: canvas.edges.filter((edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId)
  };
}

export function getChartHighlightSummary(node: CanvasNode) {
  const kind = stringData(node.data.highlightKind) ?? stringData(node.data.targetKind) ?? "axis";
  const target = stringData(node.data.targetId) ?? stringData(node.data.highlightId) ?? "ascendant";
  const label = stringData(node.data.label) ?? stringData(node.data.title) ?? target;
  const startSec = numberData(node.data.startSec) ?? numberData(node.data.timeSec) ?? 0;
  const durationSec = numberData(node.data.durationSec) ?? 1.8;
  const style = stringData(node.data.style) ?? "pulse";
  const color = stringData(node.data.color) ?? "#e05f45";
  const emphasis = numberData(node.data.emphasis) ?? 1;

  return { kind, target, label, startSec, durationSec, style, color, emphasis };
}

function compareChartHighlightNodes(left: CanvasNode, right: CanvasNode) {
  const leftStart = numberData(left.data.startSec) ?? numberData(left.data.timeSec);
  const rightStart = numberData(right.data.startSec) ?? numberData(right.data.timeSec);

  if (leftStart !== undefined || rightStart !== undefined) {
    return (leftStart ?? Number.MAX_SAFE_INTEGER) - (rightStart ?? Number.MAX_SAFE_INTEGER);
  }

  return left.position.y - right.position.y || left.position.x - right.position.x;
}

function uniqueCanvasId(canvas: CanvasDocument, baseId: string) {
  const usedIds = new Set([
    ...canvas.nodes.map((node) => node.id),
    ...canvas.edges.map((edge) => edge.id)
  ]);
  let nextId = baseId;
  let index = 2;

  while (usedIds.has(nextId)) {
    nextId = `${baseId}-${index}`;
    index += 1;
  }

  return nextId;
}

function compactStringSet(values: Array<string | undefined>) {
  return new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0));
}

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function stringData(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function numberData(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeChartHighlightKind(value: string): ChartHighlightKindValue {
  return chartHighlightKindOptions.some((option) => option.value === value)
    ? (value as ChartHighlightKindValue)
    : "axis";
}

function planetTargetOptions(chartNode: CanvasNode): ChartHighlightTargetOption[] {
  const positions = chartPositionsFromNode(chartNode);

  if (positions.length === 0) {
    return defaultPlanetTargets.map((planet) => ({
      kind: "planet",
      value: planet.id,
      targetId: planet.id,
      label: planet.label
    }));
  }

  return positions.map((position) => {
    const targetId = normalizeTargetId(position.id);
    const label = planetLabel(position.id);

    return {
      kind: "planet",
      value: targetId,
      targetId,
      label,
      detail: formatAstroPosition(position)
    };
  });
}

function houseTargetOptions(chartNode: CanvasNode): ChartHighlightTargetOption[] {
  const houses = chartHousesFromNode(chartNode);

  return Array.from({ length: 12 }, (_, index) => {
    const house = index + 1;
    const houseData = houses.find((item) => item.house === house);

    return {
      kind: "house" as const,
      value: `house-${house}`,
      targetId: `house-${house}`,
      label: `第 ${house} 宫`,
      detail: houseData ? formatAstroPosition(houseData) : undefined
    };
  });
}

function axisTargetOptions(chartNode: CanvasNode): ChartHighlightTargetOption[] {
  const houses = chartHousesFromNode(chartNode);

  return axisTargets.map((axis) => {
    const house = houses.find((item) => item.house === axis.house);

    return {
      kind: "axis",
      value: axis.id,
      targetId: axis.id,
      label: axis.label,
      detail: house ? formatAstroPosition(house) : undefined
    };
  });
}

function aspectTargetOptions(chartNode: CanvasNode): ChartHighlightTargetOption[] {
  const positions = chartPositionsFromNode(chartNode);
  const aspects: Array<ChartHighlightTargetOption & { exactness: number }> = [];

  for (let leftIndex = 0; leftIndex < positions.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < positions.length; rightIndex += 1) {
      const left = positions[leftIndex];
      const right = positions[rightIndex];

      if (!left || !right) {
        continue;
      }

      const aspect = closestMajorAspect(left.longitude, right.longitude);
      if (!aspect) {
        continue;
      }

      const targetId = normalizeTargetId(left.id);
      const secondaryTargetId = normalizeTargetId(right.id);
      const leftLabel = planetLabel(left.id);
      const rightLabel = planetLabel(right.id);

      aspects.push({
        kind: "aspect",
        value: `${targetId}=>${secondaryTargetId}`,
        targetId,
        secondaryTargetId,
        label: `${leftLabel}-${rightLabel} ${aspect.label}`,
        detail: `误差 ${aspect.exactness.toFixed(1)}°`,
        exactness: aspect.exactness
      });
    }
  }

  return aspects.sort((left, right) => left.exactness - right.exactness || left.label.localeCompare(right.label));
}

function closestMajorAspect(leftLongitude: number, rightLongitude: number) {
  const distance = shortestLongitudeDistance(leftLongitude, rightLongitude);
  let closest:
    | {
        id: string;
        label: string;
        exactness: number;
      }
    | undefined;

  for (const definition of majorAspectDefinitions) {
    const exactness = Math.abs(distance - definition.degree);

    if (exactness <= definition.orb && (!closest || exactness < closest.exactness)) {
      closest = {
        id: definition.id,
        label: definition.label,
        exactness
      };
    }
  }

  return closest;
}

function shortestLongitudeDistance(leftLongitude: number, rightLongitude: number) {
  const distance = Math.abs(normalizeDegrees(leftLongitude) - normalizeDegrees(rightLongitude));
  return distance > 180 ? 360 - distance : distance;
}

function chartPositionsFromNode(node: CanvasNode) {
  const rawPositions = node.data.positions;

  if (!Array.isArray(rawPositions)) {
    return [];
  }

  return rawPositions.flatMap((position) => {
    if (!isRecord(position)) {
      return [];
    }

    const id = stringData(position.id);
    const longitude = numberData(position.longitude);

    if (!id || longitude === undefined) {
      return [];
    }

    return [
      {
        id,
        longitude,
        sign: stringData(position.sign),
        degreeInSign: numberData(position.degreeInSign)
      } satisfies ChartPosition
    ];
  });
}

function chartHousesFromNode(node: CanvasNode) {
  const rawHouses = node.data.houses;

  if (!Array.isArray(rawHouses)) {
    return [];
  }

  return rawHouses.flatMap((house) => {
    if (!isRecord(house)) {
      return [];
    }

    const houseNumber = numberData(house.house);
    const longitude = numberData(house.longitude);

    if (
      houseNumber === undefined ||
      longitude === undefined ||
      !Number.isInteger(houseNumber) ||
      houseNumber < 1 ||
      houseNumber > 12
    ) {
      return [];
    }

    return [
      {
        house: houseNumber,
        longitude,
        sign: stringData(house.sign),
        degreeInSign: numberData(house.degreeInSign)
      } satisfies ChartHouse
    ];
  });
}

function formatAstroPosition(position: { longitude: number; sign?: string; degreeInSign?: number }) {
  const degree =
    position.degreeInSign === undefined
      ? normalizeDegrees(position.longitude)
      : position.degreeInSign;
  const degreeText = `${degree.toFixed(1)}°`;

  return position.sign ? `${position.sign} ${degreeText}` : degreeText;
}

function planetLabel(id: string) {
  const normalized = normalizeTargetId(id);
  const known = defaultPlanetTargets.find((planet) => planet.id === normalized);

  if (known) {
    return known.label;
  }

  if (["nnode", "northnode", "truenode", "meannode"].includes(normalized)) {
    return "北交点";
  }

  if (["snode", "southnode"].includes(normalized)) {
    return "南交点";
  }

  return id;
}

function normalizeTargetId(value: string) {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
