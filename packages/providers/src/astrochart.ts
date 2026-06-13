import fs from "node:fs/promises";
import path from "node:path";
import type ChartDefault from "@astrodraw/astrochart";
import type { Document, Element } from "happy-dom";
import { Window } from "happy-dom";
import { calculateNatalChart } from "./natalChart";
import type { AstroChartData, ChartProvider } from "./types";

type ChartModule = {
  default?: typeof ChartDefault;
  Chart?: typeof ChartDefault;
};

const chartElementId = "zeroflow-astrochart";

export function createAstroChartProvider(): ChartProvider {
  return {
    async calculateNatalChart(input) {
      return calculateNatalChart(input);
    },
    async renderNatalChart(input) {
      const calculated = input.birth ? calculateNatalChart(input.birth) : undefined;
      const data = input.data ?? calculated?.data.chartData ?? makeSampleNatalData();
      const source = input.data ? "provided-data" : calculated ? "calculated-birth" : "sample";
      const svg = await renderSvg({
        data,
        width: input.width ?? 1080,
        height: input.height ?? 1080,
        highlight: input.highlight
      });

      await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
      await fs.writeFile(input.outputPath, svg, "utf8");

      return {
        provider: "astrochart",
        usedMock: false,
        data: {
          assetPath: input.outputPath,
          svg,
          data,
          birth: calculated?.data.birth,
          positions: calculated?.data.positions,
          houses: calculated?.data.houses,
          calculation: calculated?.data.calculation,
          usedSampleData: source === "sample",
          source
        }
      };
    }
  };
}

async function renderSvg({
  data,
  width,
  height,
  highlight
}: {
  data: AstroChartData;
  width: number;
  height: number;
  highlight?: string;
}) {
  const window = new Window();
  const document = window.document;
  const globals = globalThis as unknown as Record<"window" | "document" | "self", unknown>;
  const previousWindow = globals.window;
  const previousDocument = globals.document;
  const previousSelf = globals.self;

  try {
    globals.window = window;
    globals.document = document;
    globals.self = window;

    const root = document.createElement("div");
    root.id = chartElementId;
    document.body.appendChild(root);

    const module = (await import("@astrodraw/astrochart")) as ChartModule;
    const Chart = module.default ?? module.Chart;
    if (!Chart) {
      throw new Error("AstroChart module did not expose Chart");
    }

    const chart = new Chart(chartElementId, width, height, {
      COLOR_BACKGROUND: "#fbfaf4",
      CIRCLE_COLOR: "#17352f",
      LINE_COLOR: "#17352f",
      POINTS_COLOR: "#17352f",
      SIGNS_COLOR: "#17352f",
      CUSPS_FONT_COLOR: "#17352f",
      SYMBOL_AXIS_FONT_COLOR: "#e05f45",
      COLORS_SIGNS: [
        "#d95235",
        "#8d6c2f",
        "#3878a8",
        "#2f856c",
        "#d95235",
        "#8d6c2f",
        "#3878a8",
        "#2f856c",
        "#d95235",
        "#8d6c2f",
        "#3878a8",
        "#2f856c"
      ],
      SYMBOL_SCALE: 1.2,
      POINTS_TEXT_SIZE: 10
    });
    chart.radix(data).aspects();

    const svg = root.querySelector("svg");
    if (!svg) {
      throw new Error("AstroChart did not render an SVG element");
    }

    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("data-provider", "astrochart");
    if (highlight) {
      svg.setAttribute("data-highlight", highlight);
    }
    annotateAstroChartSvg(svg, data, document);

    return normalizeSvgForImageDecode(svg.outerHTML);
  } finally {
    restoreGlobal(globals, "window", previousWindow);
    restoreGlobal(globals, "document", previousDocument);
    restoreGlobal(globals, "self", previousSelf);
  }
}

function restoreGlobal(
  globals: Record<"window" | "document" | "self", unknown>,
  key: "window" | "document" | "self",
  value: unknown
) {
  if (value) {
    globals[key] = value;
  } else {
    delete globals[key];
  }
}

const zodiacTargetIds = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces"
] as const;

const axisTargets = [
  { id: "ascendant", label: "ASC", cuspIndex: 0 },
  { id: "ic", label: "IC", cuspIndex: 3 },
  { id: "descendant", label: "DSC", cuspIndex: 6 },
  { id: "mc", label: "MC", cuspIndex: 9 }
] as const;

function annotateAstroChartSvg(svg: Element, data: AstroChartData, document: Document) {
  svg.setAttribute("data-zeroflow-chart", "astrochart");
  svg.setAttribute("data-zeroflow-chart-version", "1");

  annotatePlanetElements(svg, data);
  annotateZodiacElements(svg);
  annotateAspectElements(svg);

  const targetLayer = document.createElementNS(svg.namespaceURI, "g");
  targetLayer.setAttribute("id", `${chartElementId}-targets`);
  targetLayer.setAttribute("data-zeroflow-chart-layer", "targets");
  targetLayer.setAttribute("pointer-events", "none");

  appendHouseTargets(targetLayer, data, document);
  appendAxisTargets(targetLayer, data, document);

  svg.appendChild(targetLayer);
}

function annotatePlanetElements(svg: Element, data: AstroChartData) {
  Object.keys(data.planets).forEach((planetName) => {
    const element = svg.querySelector(`#${cssEscape(`${chartElementId}-astrology-radix-planets-${planetName}`)}`);

    if (!element) {
      return;
    }

    element.setAttribute("data-zeroflow-chart-element", "planet");
    element.setAttribute("data-zeroflow-chart-target", normalizeAstroTargetId(planetName));
    element.setAttribute("data-zeroflow-chart-label", planetName);
  });
}

function annotateZodiacElements(svg: Element) {
  zodiacTargetIds.forEach((targetId, index) => {
    const signSegment = svg.querySelector(`#${cssEscape(`${chartElementId}-astrology-radix-signs-${index}`)}`);
    const signSymbol = svg.querySelector(
      `#${cssEscape(`${chartElementId}-astrology-radix-signs-${capitalize(targetId)}`)}`
    );

    [signSegment, signSymbol].forEach((element) => {
      if (!element) {
        return;
      }

      element.setAttribute("data-zeroflow-chart-element", "zodiac");
      element.setAttribute("data-zeroflow-chart-target", targetId);
      element.setAttribute("data-zeroflow-chart-index", String(index + 1));
    });
  });
}

function annotateAspectElements(svg: Element) {
  svg.querySelectorAll("[data-name][data-point][data-toPoint]").forEach((element) => {
    const from = normalizeAstroTargetId(element.getAttribute("data-point") ?? "");
    const to = normalizeAstroTargetId(element.getAttribute("data-toPoint") ?? "");
    const aspect = normalizeAstroTargetId(element.getAttribute("data-name") ?? "");

    if (!from || !to) {
      return;
    }

    element.setAttribute("data-zeroflow-chart-element", "aspect");
    element.setAttribute("data-zeroflow-chart-target", `${from}-${to}`);
    element.setAttribute("data-zeroflow-chart-target-alt", `${to}-${from}`);
    element.setAttribute("data-zeroflow-chart-from", from);
    element.setAttribute("data-zeroflow-chart-to", to);
    element.setAttribute("data-zeroflow-chart-aspect", aspect);
  });
}

function appendHouseTargets(layer: Element, data: AstroChartData, document: Document) {
  const shift = astroChartShiftDegrees(data);

  data.cusps.forEach((startLongitude, index) => {
    const nextLongitude = data.cusps[(index + 1) % data.cusps.length] ?? data.cusps[0] ?? startLongitude;
    const house = index + 1;
    const path = document.createElementNS(layer.namespaceURI, "path");

    path.setAttribute("d", segmentPath(startLongitude + shift, nextLongitude + shift, 245, 428.75));
    path.setAttribute("fill", "transparent");
    path.setAttribute("stroke", "none");
    path.setAttribute("opacity", "0");
    path.setAttribute("data-zeroflow-chart-element", "house");
    path.setAttribute("data-zeroflow-chart-target", `house-${house}`);
    path.setAttribute("data-zeroflow-chart-house", String(house));
    layer.appendChild(path);
  });
}

function appendAxisTargets(layer: Element, data: AstroChartData, document: Document) {
  const shift = astroChartShiftDegrees(data);

  axisTargets.forEach((axis) => {
    const longitude = data.cusps[axis.cuspIndex];
    if (longitude === undefined) {
      return;
    }

    const from = pointForAstroAngle(longitude + shift, 505.3125);
    const to = pointForAstroAngle(longitude + shift + 180, 505.3125);
    const line = document.createElementNS(layer.namespaceURI, "line");

    line.setAttribute("x1", String(from.x));
    line.setAttribute("y1", String(from.y));
    line.setAttribute("x2", String(to.x));
    line.setAttribute("y2", String(to.y));
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "transparent");
    line.setAttribute("stroke-width", "1");
    line.setAttribute("opacity", "0");
    line.setAttribute("data-zeroflow-chart-element", "axis");
    line.setAttribute("data-zeroflow-chart-target", axis.id);
    line.setAttribute("data-zeroflow-chart-label", axis.label);
    layer.appendChild(line);
  });
}

function segmentPath(startAngle: number, endAngle: number, innerRadius: number, outerRadius: number) {
  const span = positiveAstroSpan(startAngle, endAngle);
  const largeArc = span > 180 ? 1 : 0;
  const outerStart = pointForAstroAngle(startAngle, outerRadius);
  const outerEnd = pointForAstroAngle(startAngle + span, outerRadius);
  const innerEnd = pointForAstroAngle(startAngle + span, innerRadius);
  const innerStart = pointForAstroAngle(startAngle, innerRadius);

  return [
    `M ${innerStart.x}, ${innerStart.y}`,
    `L ${outerStart.x}, ${outerStart.y}`,
    `A ${outerRadius}, ${outerRadius}, 0, ${largeArc}, 0, ${outerEnd.x}, ${outerEnd.y}`,
    `L ${innerEnd.x}, ${innerEnd.y}`,
    `A ${innerRadius}, ${innerRadius}, 0, ${largeArc}, 1, ${innerStart.x}, ${innerStart.y}`,
    "Z"
  ].join(" ");
}

function pointForAstroAngle(angle: number, radius: number) {
  const angleInRadians = ((180 - angle) * Math.PI) / 180;

  return {
    x: 540 + radius * Math.cos(angleInRadians),
    y: 540 + radius * Math.sin(angleInRadians)
  };
}

function astroChartShiftDegrees(data: AstroChartData) {
  return data.cusps[0] === undefined ? 0 : 360 - normalizeDegrees(data.cusps[0]);
}

function positiveAstroSpan(startAngle: number, endAngle: number) {
  const start = normalizeDegrees(startAngle);
  let end = normalizeDegrees(endAngle);

  if (end <= start) {
    end += 360;
  }

  return end - start;
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function normalizeAstroTargetId(value: string) {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

function capitalize(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function cssEscape(value: string) {
  return value.replace(/([ #.;?%&,:+*~'"!^$[\]()=>|/@])/g, "\\$1");
}

function normalizeSvgForImageDecode(svg: string) {
  const openTagMatch = svg.match(/^<svg\b[^>]*>/i);

  if (!openTagMatch || /\sxmlns=/.test(openTagMatch[0])) {
    return svg;
  }

  return svg.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
}

export function makeSampleNatalData(): AstroChartData {
  return {
    planets: {
      Sun: [47],
      Moon: [118],
      Mercury: [62, -1],
      Venus: [204],
      Mars: [290],
      Jupiter: [315],
      Saturn: [168, -1],
      Uranus: [12],
      Neptune: [348],
      Pluto: [268],
      Chiron: [24],
      NNode: [83, -1]
    },
    cusps: [18, 42, 66, 94, 126, 162, 198, 222, 246, 274, 306, 342]
  };
}
