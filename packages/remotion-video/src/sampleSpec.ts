import {
  compileCanvasToAstroVideoSpec,
  type CanvasDocument
} from "@zeroflow/core";

export const sampleCanvasDocument: CanvasDocument = {
  version: "1",
  viewport: { x: 64, y: 56, zoom: 1 },
  nodes: [
    {
      id: "node-topic",
      kind: "topic",
      refId: "project-ascendant-intro",
      position: { x: 0, y: 0 },
      size: { width: 240, height: 140 },
      status: "ready",
      data: {
        title: "主题",
        topic: "上升星座到底是什么？",
        description: "用 30 秒给占星小白解释上升星座"
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
        tone: "温和、适合小白",
        scriptText:
          "你有没有发现，有些人一出现，就会给人很鲜明的第一印象？上升星座，就是你出生那一刻东方地平线上正在升起的星座。"
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
        title: "星盘重点",
        description: "高亮上升点",
        chartType: "natal",
        highlight: "ascendant"
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
        title: "生活化比喻",
        description: "像走进世界的开场方式",
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
        title: "D3 Diagram",
        description: "Ascendant concept as a timeline diagram",
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
        title: "Three Scene",
        description: "Spatial orbit scene for rising sign",
        durationSec: 8,
        threeScene: "orbit",
        dataJson:
          "{\"preset\":\"orbit\",\"camera\":\"portrait-orbit\",\"speed\":0.72,\"accentColor\":\"#e8c164\",\"focus\":\"Ascendant\"}"
      }
    }
  ],
  edges: []
};

export const samplePreviewSpec = compileCanvasToAstroVideoSpec(sampleCanvasDocument);
