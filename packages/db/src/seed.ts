import {
  compileCanvasToAstroVideoSpec,
  type CanvasDocument,
  type LibraryAsset,
  type VideoProject
} from "@zeroflow/core";

export const defaultProjectId = "project-ascendant-intro";

export const defaultCanvasDocument: CanvasDocument = {
  version: "1",
  viewport: { x: 64, y: 56, zoom: 1 },
  nodes: [
    {
      id: "node-topic",
      kind: "topic",
      refId: defaultProjectId,
      position: { x: 0, y: 0 },
      size: { width: 280, height: 150 },
      status: "ready",
      data: {
        title: "主题",
        description: "用 60 秒给占星小白解释上升星座",
        topic: "上升星座到底是什么？",
        targetDurationSec: 60,
        tone: "温和、适合小白"
      }
    }
  ],
  edges: []
};

export const demoCanvasDocument: CanvasDocument = {
  version: "1",
  viewport: { x: 64, y: 56, zoom: 1 },
  nodes: [
    {
      id: "node-topic",
      kind: "topic",
      refId: defaultProjectId,
      position: { x: 0, y: 0 },
      size: { width: 240, height: 140 },
      status: "ready",
      data: {
        title: "主题",
        description: "用 60 秒给占星小白解释上升星座",
        topic: "上升星座到底是什么？"
      }
    },
    {
      id: "node-script",
      kind: "script",
      refId: "script-draft-ascendant-intro",
      position: { x: 320, y: 0 },
      size: { width: 300, height: 180 },
      status: "ready",
      data: {
        title: "文案",
        description: "生成并编辑旁白、知识点和视频节奏",
        scriptText:
          "你有没有发现，有些人一出现，就会给人很鲜明的第一印象？上升星座，就是你出生那一刻东方地平线上正在升起的星座。",
        targetDurationSec: 60,
        tone: "温和、适合小白"
      }
    },
    {
      id: "node-storyboard",
      kind: "storyboard",
      position: { x: 700, y: 0 },
      size: { width: 270, height: 160 },
      status: "ready",
      data: {
        title: "分镜计划",
        description: "按自定义数量生成可调节画面节点",
        sceneCount: 5
      }
    },
    {
      id: "node-scene-1",
      kind: "scene",
      refId: "scene-1",
      position: { x: 0, y: 260 },
      size: { width: 250, height: 170 },
      status: "ready",
      data: {
        title: "开场问题",
        description: "第一印象从哪里来？",
        durationSec: 6,
        sceneType: "text"
      }
    },
    {
      id: "node-caption-1",
      kind: "caption",
      refId: "scene-1",
      position: { x: 310, y: 270 },
      size: { width: 250, height: 150 },
      status: "ready",
      data: {
        title: "字幕",
        description: "第一印象来自哪里？",
        yPercent: 78,
        fontSize: 48,
        color: "#ffffff"
      }
    },
    {
      id: "node-voice",
      kind: "voice",
      refId: "asset-voice-soft-teacher",
      position: { x: 620, y: 270 },
      size: { width: 250, height: 150 },
      status: "ready",
      data: {
        title: "配音",
        description: "温和教学音色",
        speed: 1,
        volume: 1,
        emotion: "warm"
      }
    },
    {
      id: "node-chart",
      kind: "chart",
      refId: "chart-ascendant-demo",
      position: { x: 940, y: 250 },
      size: { width: 250, height: 160 },
      status: "ready",
      data: {
        title: "星盘",
        description: "上升点高亮",
        chartType: "natal",
        highlight: "ascendant",
        birthDate: "1990-01-01",
        birthTime: "12:00",
        timezoneOffsetMinutes: 480,
        timezone: "Asia/Shanghai",
        latitude: 39.9042,
        longitude: 116.4074,
        placeName: "北京",
        houseSystem: "equal",
        zodiacMode: "tropical",
        siderealAyanamsa: "lahiri",
        planetSet: "modern",
        nodeType: "mean"
      }
    },
    {
      id: "node-image",
      kind: "image",
      refId: "asset-sketch-doorway",
      position: { x: 0, y: 520 },
      size: { width: 270, height: 160 },
      status: "ready",
      data: {
        title: "图像",
        description: "人推开门走进星空房间",
        prompt: "简洁线稿插画：一个人推开门走进星空房间，画面温暖清晰"
      }
    },
    {
      id: "node-d3",
      kind: "d3",
      refId: "visual-d3-ascendant-flow",
      position: { x: 330, y: 520 },
      size: { width: 280, height: 170 },
      status: "ready",
      data: {
        title: "D3 Diagram",
        description: "Ascendant concept as a timeline diagram",
        durationSec: 8,
        diagram: "timeline",
        dataJson:
          '{"events":[{"label":"Birth moment","value":0},{"label":"Eastern horizon","value":1},{"label":"Rising sign","value":2},{"label":"First impression","value":3}]}'
      }
    },
    {
      id: "node-three",
      kind: "three",
      refId: "visual-three-orbit",
      position: { x: 660, y: 520 },
      size: { width: 280, height: 170 },
      status: "ready",
      data: {
        title: "Three Scene",
        description: "Spatial orbit scene for rising sign",
        durationSec: 8,
        threeScene: "orbit",
        camera: "portrait-orbit",
        speed: 0.72,
        accentColor: "#e8c164",
        dataJson:
          '{"preset":"orbit","camera":"portrait-orbit","speed":0.72,"accentColor":"#e8c164","focus":"Ascendant"}'
      }
    },
    {
      id: "node-composition",
      kind: "composition",
      position: { x: 990, y: 540 },
      size: { width: 270, height: 160 },
      status: "idle",
      data: {
        title: "画面合成",
        description: "整合分镜、字幕、配音和素材",
        renderer: "remotion-scene"
      }
    },
    {
      id: "node-preview",
      kind: "preview",
      position: { x: 700, y: 760 },
      size: { width: 260, height: 150 },
      status: "idle",
      data: {
        title: "预览",
        description: "整条视频预览",
        renderer: "remotion"
      }
    },
    {
      id: "node-export",
      kind: "export",
      position: { x: 1030, y: 760 },
      size: { width: 240, height: 150 },
      status: "idle",
      data: {
        title: "导出",
        description: "1080x1920 MP4",
        format: "mp4"
      }
    }
  ],
  edges: [
    {
      id: "edge-topic-script",
      fromNodeId: "node-topic",
      toNodeId: "node-script",
      relation: "produces"
    },
    {
      id: "edge-script-storyboard",
      fromNodeId: "node-script",
      toNodeId: "node-storyboard",
      relation: "produces"
    },
    {
      id: "edge-storyboard-scene",
      fromNodeId: "node-storyboard",
      toNodeId: "node-scene-1",
      relation: "produces"
    },
    {
      id: "edge-scene-caption",
      fromNodeId: "node-scene-1",
      toNodeId: "node-caption-1",
      relation: "uses"
    },
    {
      id: "edge-scene-voice",
      fromNodeId: "node-scene-1",
      toNodeId: "node-voice",
      relation: "uses"
    },
    {
      id: "edge-scene-chart",
      fromNodeId: "node-scene-1",
      toNodeId: "node-chart",
      relation: "uses"
    },
    {
      id: "edge-scene-image",
      fromNodeId: "node-scene-1",
      toNodeId: "node-image",
      relation: "uses"
    },
    { id: "edge-scene-d3", fromNodeId: "node-scene-1", toNodeId: "node-d3", relation: "uses" },
    {
      id: "edge-scene-three",
      fromNodeId: "node-scene-1",
      toNodeId: "node-three",
      relation: "uses"
    },
    {
      id: "edge-assets-composition",
      fromNodeId: "node-image",
      toNodeId: "node-composition",
      relation: "renders"
    },
    {
      id: "edge-chart-composition",
      fromNodeId: "node-chart",
      toNodeId: "node-composition",
      relation: "renders"
    },
    {
      id: "edge-d3-composition",
      fromNodeId: "node-d3",
      toNodeId: "node-composition",
      relation: "renders"
    },
    {
      id: "edge-three-composition",
      fromNodeId: "node-three",
      toNodeId: "node-composition",
      relation: "renders"
    },
    {
      id: "edge-composition-preview",
      fromNodeId: "node-composition",
      toNodeId: "node-preview",
      relation: "renders"
    },
    {
      id: "edge-preview-export",
      fromNodeId: "node-preview",
      toNodeId: "node-export",
      relation: "produces"
    }
  ]
};

export function makeDefaultProject(now = new Date().toISOString()): VideoProject {
  const spec = compileCanvasToAstroVideoSpec(defaultCanvasDocument);

  return {
    id: defaultProjectId,
    title: "上升星座到底是什么？",
    topic: "上升星座到底是什么？",
    status: "draft",
    spec,
    canvas: defaultCanvasDocument,
    assetRefs: [],
    createdAt: now,
    updatedAt: now
  };
}

export function makeDefaultLibraryAssets(now = new Date().toISOString()): LibraryAsset[] {
  return [
    {
      id: "asset-voice-soft-teacher",
      name: "温和教学音色",
      kind: "voice-profile",
      status: "ready",
      tags: ["voice", "teaching", "warm"],
      reusable: true,
      metadata: {
        provider: "runninghub-indextts",
        description: "默认教学音色，可作为 RunningHub IndexTTS 参考音色"
      },
      usageCount: 0,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "style-astro-teaching-default",
      name: "占星教学默认视觉",
      kind: "chart-style",
      status: "ready",
      tags: ["style", "chart", "subtitle"],
      reusable: true,
      metadata: {
        captionYPercent: 78,
        captionFontSize: 48,
        palette: ["#102c2a", "#e8c164", "#fbfaf4"]
      },
      usageCount: 0,
      createdAt: now,
      updatedAt: now
    }
  ];
}
