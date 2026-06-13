import type { CanvasNode, JobType } from "@zeroflow/core";
import { getSceneImageModel, getSceneImageStyle } from "./aiModels";

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
  "three"
];

const defaultChartBirthData = {
  birthDate: "1990-01-01",
  birthTime: "12:00",
  timezoneOffsetMinutes: 480,
  timezone: "Asia/Shanghai",
  latitude: 39.9042,
  longitude: 116.4074,
  placeName: "Beijing",
  houseSystem: "equal",
  zodiacMode: "tropical",
  siderealAyanamsa: "lahiri",
  planetSet: "modern",
  nodeType: "mean",
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
  const visualPrompt = getString(
    node.data.visualPrompt,
    `简洁的占星教学插画，主题是：${description}`
  );

  switch (resourceId) {
    case "caption":
      return {
        type: "align-captions",
        input: {}
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
    case "image": {
      const imageModel = getSceneImageModel(node);
      const imageStyle = getSceneImageStyle(node);

      return {
        type: "generate-image",
        input: {
          prompt: visualPrompt,
          model: imageModel,
          imageStyle,
          durationSec
        }
      };
    }
    case "d3":
      return {
        type: "generate-d3",
        input: {
          prompt: visualPrompt,
          title: `D3 ${title}`,
          description,
          narration,
          durationSec,
          diagram: "timeline",
          visualPreset: "timeline",
          model: getString(node.data.aiModel, "gpt-5.5")
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
