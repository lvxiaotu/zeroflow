import type { CanvasNode, JobType } from "@zeroflow/core";

export type NodeJobRequest = {
  type: JobType;
  input: Record<string, unknown>;
};

export type SceneResourceJobId =
  | "caption"
  | "voice"
  | "chart"
  | "image"
  | "d3"
  | "three"
  | "composition";

export const sceneResourceJobIds: SceneResourceJobId[] = [
  "caption",
  "voice",
  "chart",
  "image",
  "d3",
  "three",
  "composition"
];

const defaultChartBirthData = {
  birthDate: "1990-01-01",
  birthTime: "12:00",
  timezoneOffsetMinutes: 480,
  latitude: 39.9042,
  longitude: 116.4074,
  placeName: "Beijing",
  houseSystem: "equal",
  chartType: "natal",
  highlight: "ascendant"
};

export function getSceneResourceJobRequest(
  node: CanvasNode,
  resourceId: SceneResourceJobId
): NodeJobRequest {
  const title = getString(node.data.title, node.refId ?? node.id);
  const description = getString(node.data.description, title);
  const narration = getString(node.data.narration, description);
  const durationSec = getNumber(node.data.durationSec, 6);
  const captionText = getString(node.data.caption, narration);
  const visualPrompt = getString(
    node.data.visualPrompt,
    `simple educational astrology line drawing about ${description}`
  );

  switch (resourceId) {
    case "caption":
      return {
        type: "align-captions",
        input: {
          text: captionText,
          durationSec
        }
      };
    case "voice":
      return {
        type: "generate-tts",
        input: {
          text: narration,
          durationSec
        }
      };
    case "chart":
      return {
        type: "generate-chart",
        input: {
          ...defaultChartBirthData,
          label: title
        }
      };
    case "image":
      return {
        type: "generate-image",
        input: {
          prompt: visualPrompt,
          durationSec
        }
      };
    case "d3":
      return {
        type: "create-d3-node",
        input: {
          title: `D3 ${title}`,
          description,
          narration,
          durationSec,
          diagram: "timeline",
          visualPreset: "timeline"
        }
      };
    case "three":
      return {
        type: "create-three-node",
        input: {
          title: `Three ${title}`,
          description,
          narration,
          durationSec,
          threeScene: "orbit",
          visualPreset: "orbit"
        }
      };
    case "composition":
      return {
        type: "create-composition-node",
        input: {
          sourceNodeKind: node.kind,
          sceneId: node.refId ?? node.id,
          sourceSceneNodeId: node.id
        }
      };
  }
}

function getString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
