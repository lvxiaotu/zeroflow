export type D3VisualPreset = {
  id: "timeline" | "relationship" | "tree" | "distribution";
  label: string;
  diagram: "timeline" | "relationship" | "tree" | "distribution";
  title: string;
  description: string;
  durationSec: number;
  data: unknown;
};

export type ThreeVisualPreset = {
  id: "orbit" | "zodiac-space" | "planet-focus";
  label: string;
  scene: "orbit" | "zodiac-space" | "planet-focus";
  title: string;
  description: string;
  durationSec: number;
  camera: string;
  speed: number;
  accentColor: string;
  data: unknown;
};

export type VisualJsonStatus = {
  state: "empty" | "invalid" | "valid";
  label: string;
  canFormat: boolean;
};

export type VisualPresetPatch = Record<string, string | number>;

export const d3VisualPresets: D3VisualPreset[] = [
  {
    id: "timeline",
    label: "Ascendant Timeline",
    diagram: "timeline",
    title: "D3 Diagram",
    description: "Ascendant concept as a timeline diagram",
    durationSec: 8,
    data: {
      events: [
        { label: "Birth moment", value: 0 },
        { label: "Eastern horizon", value: 1 },
        { label: "Rising sign", value: 2 },
        { label: "First impression", value: 3 }
      ]
    }
  },
  {
    id: "relationship",
    label: "Concept Links",
    diagram: "relationship",
    title: "D3 Relationship Map",
    description: "Link birth time, horizon, rising sign, and visible style",
    durationSec: 8,
    data: {
      nodes: ["Birth moment", "Eastern horizon", "Rising sign", "Visible style"],
      links: [
        ["Birth moment", "Eastern horizon"],
        ["Eastern horizon", "Rising sign"],
        ["Rising sign", "Visible style"]
      ]
    }
  },
  {
    id: "tree",
    label: "Teaching Tree",
    diagram: "tree",
    title: "D3 Teaching Tree",
    description: "Break the rising sign into teachable branches",
    durationSec: 8,
    data: {
      root: "Rising sign",
      children: ["First impression", "Body language", "Fast reaction", "Style entry point"]
    }
  },
  {
    id: "distribution",
    label: "Emphasis Bars",
    diagram: "distribution",
    title: "D3 Emphasis Bars",
    description: "Show how the lesson weights visible behavior and expression",
    durationSec: 8,
    data: {
      values: [
        { label: "Outer response", value: 42 },
        { label: "Expression style", value: 34 },
        { label: "First impression", value: 24 }
      ]
    }
  }
];

export const threeVisualPresets: ThreeVisualPreset[] = [
  {
    id: "orbit",
    label: "Ascendant Orbit",
    scene: "orbit",
    title: "Three Scene",
    description: "Spatial orbit scene for rising sign",
    durationSec: 8,
    camera: "portrait-orbit",
    speed: 0.72,
    accentColor: "#e8c164",
    data: {
      preset: "orbit",
      camera: "portrait-orbit",
      speed: 0.72,
      accentColor: "#e8c164",
      focus: "Ascendant"
    }
  },
  {
    id: "zodiac-space",
    label: "Zodiac Space",
    scene: "zodiac-space",
    title: "Three Zodiac Space",
    description: "Place the lesson inside a spatial zodiac field",
    durationSec: 8,
    camera: "slow-push",
    speed: 0.5,
    accentColor: "#7db181",
    data: {
      preset: "zodiac-space",
      camera: "slow-push",
      speed: 0.5,
      accentColor: "#7db181",
      focus: "Zodiac wheel"
    }
  },
  {
    id: "planet-focus",
    label: "Planet Focus",
    scene: "planet-focus",
    title: "Three Planet Focus",
    description: "Use depth and orbit to focus one symbol at a time",
    durationSec: 8,
    camera: "portrait-close",
    speed: 0.9,
    accentColor: "#d96b52",
    data: {
      preset: "planet-focus",
      camera: "portrait-close",
      speed: 0.9,
      accentColor: "#d96b52",
      focus: "Sun"
    }
  }
];

export function getD3VisualPreset(id: unknown): D3VisualPreset {
  return d3VisualPresets.find((preset) => preset.id === id) ?? d3VisualPresets[0]!;
}

export function getThreeVisualPreset(id: unknown): ThreeVisualPreset {
  return threeVisualPresets.find((preset) => preset.id === id) ?? threeVisualPresets[0]!;
}

export function d3VisualPresetPatch(id: unknown): VisualPresetPatch {
  const preset = getD3VisualPreset(id);

  return {
    visualPreset: preset.id,
    title: preset.title,
    description: preset.description,
    durationSec: preset.durationSec,
    diagram: preset.diagram,
    dataJson: stableJson(preset.data)
  };
}

export function threeVisualPresetPatch(id: unknown): VisualPresetPatch {
  const preset = getThreeVisualPreset(id);

  return {
    visualPreset: preset.id,
    title: preset.title,
    description: preset.description,
    durationSec: preset.durationSec,
    threeScene: preset.scene,
    camera: preset.camera,
    speed: preset.speed,
    accentColor: preset.accentColor,
    dataJson: stableJson(preset.data)
  };
}

export function formatVisualDataJson(value: string) {
  const parsed = parseVisualDataJson(value);

  if (!parsed.ok) {
    return parsed;
  }

  return {
    ok: true as const,
    value: stableJson(parsed.value)
  };
}

export function d3DataJsonStatus(diagram: string, value: string): VisualJsonStatus {
  const parsed = parseVisualDataJson(value);
  if (!parsed.ok) {
    return statusFromParse(parsed.error);
  }

  const record = recordData(parsed.value);
  if (!record) {
    return invalidStatus("Expected a JSON object");
  }

  if (diagram === "relationship") {
    return Array.isArray(record.nodes) && Array.isArray(record.links)
      ? validStatus("Valid relationship data")
      : invalidStatus("Expected nodes[] and links[]");
  }

  if (diagram === "tree") {
    return typeof record.root === "string" && Array.isArray(record.children)
      ? validStatus("Valid tree data")
      : invalidStatus("Expected root and children[]");
  }

  if (diagram === "distribution") {
    return Array.isArray(record.values)
      ? validStatus("Valid distribution data")
      : invalidStatus("Expected values[]");
  }

  return Array.isArray(record.events)
    ? validStatus("Valid timeline data")
    : invalidStatus("Expected events[]");
}

export function threeDataJsonStatus(scene: string, value: string): VisualJsonStatus {
  const parsed = parseVisualDataJson(value);
  if (!parsed.ok) {
    return statusFromParse(parsed.error);
  }

  const record = recordData(parsed.value);
  if (!record) {
    return invalidStatus("Expected a JSON object");
  }

  if (record.preset !== scene) {
    return invalidStatus("JSON preset should match selected scene");
  }

  return typeof record.focus === "string" && typeof record.accentColor === "string"
    ? validStatus("Valid Three scene data")
    : invalidStatus("Expected focus and accentColor");
}

export function parseVisualDataJson(
  value: string
): { ok: true; value: unknown } | { ok: false; error: "empty" | "invalid" } {
  if (value.trim().length === 0) {
    return { ok: false, error: "empty" };
  }

  try {
    return { ok: true, value: JSON.parse(value) as unknown };
  } catch {
    return { ok: false, error: "invalid" };
  }
}

function statusFromParse(error: "empty" | "invalid"): VisualJsonStatus {
  return error === "empty"
    ? { state: "empty", label: "No JSON data", canFormat: false }
    : invalidStatus("Invalid JSON");
}

function validStatus(label: string): VisualJsonStatus {
  return { state: "valid", label, canFormat: true };
}

function invalidStatus(label: string): VisualJsonStatus {
  return { state: "invalid", label, canFormat: false };
}

function recordData(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stableJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
