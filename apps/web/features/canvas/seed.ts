import type { CanvasDocument, CanvasNodeKind } from "@zeroflow/core";

export const defaultProjectId = "project-ascendant-intro";

export const nodeKindLabels: Record<CanvasNodeKind, string> = {
  topic: "主题",
  script: "文案",
  structure: "结构",
  storyboard: "分镜计划",
  chapter: "章节",
  scene: "分镜",
  caption: "字幕",
  voice: "配音",
  chart: "星盘",
  image: "简笔画",
  d3: "D3 图表",
  three: "三维场景",
  music: "音乐",
  composition: "画面合成",
  preview: "预览",
  export: "导出"
};

export const nodeKindDescriptions: Record<CanvasNodeKind, string> = {
  topic: "选择这条视频要讲的占星主题",
  script: "生成并编辑口播文案和节奏",
  structure: "长视频章节结构",
  storyboard: "把文案拆成可编辑的分镜",
  chapter: "长视频中的一个章节",
  scene: "单个视频画面",
  caption: "字幕时间轴和样式",
  voice: "配音参数",
  chart: "星盘与高亮目标",
  image: "简笔画提示词和素材",
  d3: "用于动画教学图解的结构化数据",
  three: "三维空间场景配置",
  music: "BGM 和声音设计",
  composition: "合成当前分镜画面",
  preview: "整条视频预览",
  export: "MP4 导出设置"
};

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
        tone: "温和、适合新手"
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
        description: "生成并优化口播文案和节奏",
        scriptText:
          "你有没有发现，有些人一出现就会给人很强的第一印象？上升星座，就是你出生那一刻从东方地平线升起的星座。",
        targetDurationSec: 60,
        tone: "温和、适合新手"
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
        description: "把文案拆成可编辑的视觉段落",
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
        description: "第一印象从哪里来？",
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
        description: "温和的教学配音",
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
        description: "高亮上升点",
        chartType: "natal",
        highlight: "ascendant",
        birthDate: "1990-01-01",
        birthTime: "12:00",
        timezoneOffsetMinutes: 480,
        latitude: 39.9042,
        longitude: 116.4074,
        placeName: "Beijing",
        houseSystem: "equal"
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
        title: "简笔画",
        description: "一个人推开门走进星空房间",
        prompt: "simple line drawing, a person opening a door into a starry room"
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
        title: "D3 图表",
        description: "用时间线图解上升星座概念",
        durationSec: 8,
        diagram: "timeline",
        dataJson:
          "{\"events\":[{\"label\":\"Birth moment\",\"value\":0},{\"label\":\"Eastern horizon\",\"value\":1},{\"label\":\"Rising sign\",\"value\":2},{\"label\":\"First impression\",\"value\":3}]}"
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
        title: "三维场景",
        description: "用于上升星座的空间轨道场景",
        durationSec: 8,
        threeScene: "orbit",
        camera: "portrait-orbit",
        speed: 0.72,
        accentColor: "#e8c164",
        dataJson:
          "{\"preset\":\"orbit\",\"camera\":\"portrait-orbit\",\"speed\":0.72,\"accentColor\":\"#e8c164\",\"focus\":\"Ascendant\"}"
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
        description: "1080x1920 MP4 导出",
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
    }
  ]
};
