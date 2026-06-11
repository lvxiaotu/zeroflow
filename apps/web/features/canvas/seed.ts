import type { CanvasDocument, CanvasNodeKind } from "@zeroflow/core";

export const defaultProjectId = "project-ascendant-intro";

export const nodeKindLabels: Record<CanvasNodeKind, string> = {
  topic: "Topic",
  script: "Script",
  storyboard: "Storyboard",
  scene: "Scene",
  caption: "Caption",
  voice: "Voice",
  chart: "Chart",
  image: "Image",
  d3: "D3 Diagram",
  three: "Three Scene",
  music: "Music",
  composition: "Composition",
  preview: "Preview",
  export: "Export"
};

export const nodeKindDescriptions: Record<CanvasNodeKind, string> = {
  topic: "Choose the topic for the video",
  script: "Generate and edit narration and beats",
  storyboard: "Split the script into editable scenes",
  scene: "A single visual scene",
  caption: "Caption timing and styling",
  voice: "Voice settings",
  chart: "Astrolabe and highlight targets",
  image: "Image prompt and assets",
  d3: "Structured diagram data for animated teaching visuals",
  three: "Spatial scene contract for Three.js visuals",
  music: "BGM and sound design",
  composition: "Composition result",
  preview: "Full video preview",
  export: "MP4 export settings"
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
        title: "Topic",
        description: "45-second intro for ascendant sign basics",
        topic: "What exactly is the ascendant sign?",
        targetDurationSec: 45,
        tone: "warm and beginner-friendly"
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
        title: "Topic",
        description: "45-second intro for ascendant sign basics",
        topic: "What exactly is the ascendant sign?"
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
        title: "Script",
        description: "Generate and refine narration and beats",
        scriptText:
          "Have you noticed that some people make a strong first impression the moment they appear? The ascendant sign is the sign rising on the eastern horizon at the moment you were born.",
        targetDurationSec: 45,
        tone: "warm and beginner-friendly"
      }
    },
    {
      id: "node-storyboard",
      kind: "storyboard",
      position: { x: 700, y: 0 },
      size: { width: 270, height: 160 },
      status: "ready",
      data: {
        title: "Storyboard",
        description: "Break the script into editable visual beats",
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
        title: "Opening",
        description: "Where does the first impression come from?",
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
        title: "Caption",
        description: "Where does the first impression come from?",
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
        title: "Voice",
        description: "Warm teaching voice",
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
        title: "Chart",
        description: "Ascendant highlight point",
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
        title: "Image",
        description: "A person walking through a doorway into a starry room",
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
        title: "Composition",
        description: "Combine scenes, captions, voice, and assets",
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
        title: "Preview",
        description: "Full video preview",
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
        title: "Export",
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
    }
  ]
};
