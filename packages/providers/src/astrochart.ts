import fs from "node:fs/promises";
import path from "node:path";
import type ChartDefault from "@astrodraw/astrochart";
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

    svg.setAttribute("data-provider", "astrochart");
    if (highlight) {
      svg.setAttribute("data-highlight", highlight);
    }

    return svg.outerHTML;
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
