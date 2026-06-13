import type { CanvasDocument, CanvasNode } from "../schema/canvas";
import type { AstroVideoSpec } from "../schema/project";
import {
  astroChartCalculationSchema,
  astroChartHighlightSchema,
  astroChartHouseSchema,
  astroChartPositionSchema
} from "../schema/scenes";
import type {
  AstroChartHighlight,
  AstroChartCalculation,
  AstroChartHouse,
  AstroChartPosition,
  AudioTrack,
  CaptionCue,
  CaptionLayout,
  D3DiagramSceneSpec,
  SceneLayoutPreset,
  SceneSpec,
  ThreeSceneSpec,
  Transition,
  VisualLayer,
  VisualRenderMode,
  VoiceSettings
} from "../schema/scenes";

type CompileCanvasOptions = {
  title?: string;
  format?: AstroVideoSpec["format"];
  fps?: number;
  stylePresetId?: string;
  templateId?: string;
};

const defaultCaption: CaptionLayout = {
  cues: [],
  yPercent: 78,
  fontSize: 48,
  color: "#ffffff",
  animation: "fade"
};

const defaultVoice: VoiceSettings = {
  speed: 1,
  volume: 1
};
const d3DiagramKinds = ["timeline", "relationship", "tree", "distribution"] as const;
const threeSceneKinds = ["orbit", "zodiac-space", "planet-focus"] as const;
const compositionVisualKinds = ["auto", "text", "chart", "image", "d3", "three"] as const;
const compositionSecondaryVisualKinds = ["none", "chart", "image"] as const;
const layoutPresets = ["single", "split", "overlay"] as const;
const transitions = ["cut", "fade", "wipe", "zoom"] as const;
const chartAxisHighlightIds = ["ascendant", "descendant", "mc", "ic"] as const;
const chartPlanetHighlightIds = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
  "chiron",
  "north-node",
  "south-node",
  "lilith"
] as const;
const sceneVoiceTailPaddingSec = 0.9;
const defaultAscendantHighlightLabel = "\u4e0a\u5347\u70b9";

type CompositionVisualKind = (typeof compositionVisualKinds)[number];
type CompositionSecondaryVisualKind = (typeof compositionSecondaryVisualKinds)[number];

export function compileCanvasToAstroVideoSpec(
  canvas: CanvasDocument,
  options: CompileCanvasOptions = {}
): AstroVideoSpec {
  const topicNode = findNode(canvas, "topic");
  const scriptNode = findNode(canvas, "script");
  const captionNode = findGlobalNode(canvas, "caption");
  const voiceNode = findGlobalNode(canvas, "voice");
  const title = options.title ?? stringData(topicNode, "topic", "占星教学短视频");
  const caption = captionFromNode(captionNode);
  const voice = voiceFromNode(voiceNode);
  const scenes = compileSceneNodes(canvas, caption, voice);
  const audioTracks = audioTracksFromCanvas(canvas, scenes, voiceNode, voice);

  return {
    version: "1",
    title,
    format: options.format ?? "portrait",
    fps: options.fps ?? 30,
    stylePresetId: options.stylePresetId ?? "style-astro-teaching-default",
    templateId: options.templateId ?? "template-canvas-preview",
    scenes:
      scenes.length > 0
        ? scenes
        : hasLegacyRenderableNodes(canvas)
          ? compileFallbackScenes(canvas, caption, voice, scriptNode)
          : [],
    audio: {
      tracks: audioTracks
    }
  };
}

export function getSpecDurationSec(spec: AstroVideoSpec) {
  return spec.scenes.reduce((total, scene) => total + scene.durationSec, 0);
}

export function getSpecDurationFrames(spec: AstroVideoSpec) {
  return Math.round(getSpecDurationSec(spec) * spec.fps);
}

type SceneResourceNodes = {
  captionNode?: CanvasNode;
  chartNode?: CanvasNode;
  chartHighlightNodes?: CanvasNode[];
  imageNode?: CanvasNode;
  d3Node?: CanvasNode;
  threeNode?: CanvasNode;
  voiceNode?: CanvasNode;
  compositionNode?: CanvasNode;
};

function compileSceneNodes(
  canvas: CanvasDocument,
  baseCaption: CaptionLayout,
  voice: VoiceSettings
) {
  const chartNode = findGlobalNode(canvas, "chart");
  const imageNode = findGlobalNode(canvas, "image");
  const d3Node = findGlobalNode(canvas, "d3");
  const threeNode = findGlobalNode(canvas, "three");
  const sceneNodes = canvas.nodes
    .filter((node) => node.kind === "scene" && node.data.generatedBy === "generate-storyboard")
    .sort((left, right) => left.position.y - right.position.y || left.position.x - right.position.x);

  const scenes = sceneNodes.map((node, index) => {
    const resources = findSceneResources(canvas, node);
    const sceneVoice = resources.voiceNode ? voiceFromNode(resources.voiceNode) : voice;

    return sceneFromNode(
      node,
      index,
      captionForScene(baseCaption, node, resources),
      sceneVoice,
      resources
    );
  });

  if (sceneNodes.length > 0) {
    const generatedScenes: SceneSpec[] = [...scenes];

    if (chartNode && !generatedScenes.some((scene) => scene.type === "astro-chart")) {
      generatedScenes.splice(1, 0, chartSceneFromNode(chartNode, baseCaption, voice, canvas));
    }

    if (imageNode && !generatedScenes.some((scene) => scene.type === "sketch")) {
      const insertIndex = Math.min(generatedScenes.length, chartNode ? 2 : 1);
      generatedScenes.splice(insertIndex, 0, sketchSceneFromNode(imageNode, baseCaption, voice));
    }

    if (d3Node && !generatedScenes.some((scene) => scene.type === "d3-diagram")) {
      const insertIndex = Math.min(generatedScenes.length, chartNode || imageNode ? 3 : 1);
      generatedScenes.splice(insertIndex, 0, d3DiagramSceneFromNode(d3Node, baseCaption, voice));
    }

    if (threeNode && !generatedScenes.some((scene) => scene.type === "three-scene")) {
      const insertIndex = Math.min(generatedScenes.length, d3Node ? 4 : 2);
      generatedScenes.splice(insertIndex, 0, threeSceneFromNode(threeNode, baseCaption, voice));
    }

    return generatedScenes;
  }

  return scenes;
}

function sceneFromNode(
  node: CanvasNode,
  index: number,
  caption: CaptionLayout,
  voice: VoiceSettings,
  resources: SceneResourceNodes = {}
): SceneSpec {
  const { chartNode, imageNode, d3Node, threeNode } = resources;
  const id = node.refId ?? `scene-${index + 1}`;
  const title = stringData(node, "title", `分镜 ${index + 1}`);
  const narration = stringData(node, "narration", stringData(node, "description", title));
  const durationSec = sceneDurationSec(node, resources);
  const layoutPreset = layoutPresetData(resources.compositionNode);
  const explicitSceneType = stringData(node, "sceneType", undefined);
  const compositionSceneType = sceneTypeFromComposition(resources);
  const sceneType =
    compositionSceneType ??
    inferAutoSceneType(node, resources, explicitSceneType);
  const visualLayers = visualLayersFromComposition(node, resources, sceneType);
  const visualLayerData = visualLayers.length > 0 ? { visualLayers } : {};

  if (sceneType === "astro-chart") {
    return {
      id,
      type: "astro-chart",
      title,
      narration,
      durationSec,
      transition: transitionData(resources.compositionNode, "zoom"),
      layoutPreset,
      ...visualLayerData,
      chartId: stringData(chartNode, "refId", stringData(node, "chartId", "chart-generated")),
      chartAssetId: stringData(chartNode, "assetId", stringData(node, "assetId", undefined)),
      chartAssetUrl: stringData(chartNode, "assetUrl", stringData(node, "assetUrl", undefined)),
      chartSvg: chartSvgFromNode(chartNode ?? node),
      chartSource: stringData(chartNode, "source", stringData(node, "source", undefined)),
      positions: chartPositionsFromNode(chartNode ?? node),
      houses: chartHousesFromNode(chartNode ?? node),
      calculation: chartCalculationFromNode(chartNode ?? node),
      highlights: chartHighlightsFromNodes(
        [node, chartNode],
        stringData(chartNode, "highlight", stringData(node, "highlight", "ascendant")),
        stringData(
          chartNode,
          "highlightLabel",
          stringData(node, "highlightLabel", defaultAscendantHighlightLabel)
        ),
        resources.chartHighlightNodes
      ),
      caption,
      voice
    };
  }

  if (sceneType === "sketch") {
    return {
      id,
      type: "sketch",
      title,
      narration,
      durationSec,
      transition: transitionData(resources.compositionNode, "wipe"),
      layoutPreset,
      ...visualLayerData,
      prompt: stringData(
        imageNode,
        "prompt",
        stringData(node, "visualPrompt", "简洁的占星教学插画，清晰表达核心概念")
      ),
      assetId: stringData(imageNode, "assetId", stringData(node, "assetId", undefined)),
      assetUrl: stringData(imageNode, "assetUrl", stringData(node, "assetUrl", undefined)),
      assetSource: stringData(imageNode, "provider", stringData(node, "source", undefined)),
      caption,
      voice
    };
  }

  if (sceneType === "d3-diagram") {
    return {
      ...d3DiagramSceneFromNode(d3Node ?? node, caption, voice),
      durationSec,
      transition: transitionData(resources.compositionNode, "wipe"),
      layoutPreset,
      ...visualLayerData
    };
  }

  if (sceneType === "three-scene") {
    return {
      ...threeSceneFromNode(threeNode ?? node, caption, voice),
      durationSec,
      transition: transitionData(resources.compositionNode, "zoom"),
      layoutPreset,
      ...visualLayerData
    };
  }

  return {
    id,
    type: "text",
    title,
    narration,
    durationSec,
    transition: transitionData(resources.compositionNode, "fade"),
    layoutPreset,
    ...visualLayerData,
    headline: stringData(node, "description", title),
    body: stringData(node, "body", undefined),
    caption,
    voice
  };
}

function sceneDurationSec(sceneNode: CanvasNode, resources: SceneResourceNodes) {
  const voiceDurationSec = sceneVoiceDurationSec(resources);
  const voiceSafeDurationSec =
    voiceDurationSec === undefined ? 0 : voiceDurationSec + sceneVoiceTailPaddingSec;
  const durationSec = Math.max(
    numberData(sceneNode, "durationSec", 6),
    numberData(resources.compositionNode, "durationSec", 0),
    numberData(resources.captionNode, "durationSec", 0),
    captionCueEndSec(resources.captionNode),
    voiceSafeDurationSec
  );

  return Math.round(Math.max(0.5, durationSec) * 100) / 100;
}

function sceneVoiceDurationSec(resources: SceneResourceNodes) {
  const voiceNode = resources.voiceNode;

  if (!voiceNode || !booleanData(resources.compositionNode, "includeVoice", true)) {
    return undefined;
  }

  const durationSec = Math.max(
    numberData(voiceNode, "audioDurationSec", 0),
    numberData(voiceNode, "durationSec", 0)
  );
  const playbackRate = Math.max(0.1, numberData(voiceNode, "speed", defaultVoice.speed));

  return durationSec > 0 ? durationSec / playbackRate : undefined;
}

function captionCueEndSec(node?: CanvasNode) {
  return captionCuesFromNode(node).reduce(
    (max, cue) => Math.max(max, cue.startSec + cue.durationSec),
    0
  );
}

function d3DiagramSceneFromNode(
  d3Node: CanvasNode,
  baseCaption: CaptionLayout,
  voice: VoiceSettings
): D3DiagramSceneSpec {
  const diagram = d3DiagramKindData(d3Node, "diagram", "timeline");
  const title = stringData(d3Node, "title", "Visual relationship map");
  const assetUrl = stringData(d3Node, "assetUrl", undefined);
  const renderMode = visualRenderModeData(d3Node, assetUrl ? "asset" : "contract");
  const description = stringData(
    d3Node,
    "description",
    "Use a D3 contract to explain the astrology idea as structured data."
  );

  return {
    id: stringData(d3Node, "sceneId", `scene-d3-${diagram}`),
    type: "d3-diagram",
    title,
    narration: stringData(
      d3Node,
      "narration",
      "Now we turn the abstract astrology idea into a structured visual diagram."
    ),
    durationSec: numberData(d3Node, "durationSec", 8),
    transition: "wipe",
    diagram,
    data: jsonDataFromNode(d3Node, defaultD3Data(diagram)),
    renderMode,
    assetId: stringData(d3Node, "assetId", assetUrl ? d3Node.refId : undefined),
    assetUrl,
    assetSource: stringData(d3Node, "provider", undefined),
    caption: {
      ...baseCaption,
      text: description
    },
    voice
  };
}

function threeSceneFromNode(
  threeNode: CanvasNode,
  baseCaption: CaptionLayout,
  voice: VoiceSettings
): ThreeSceneSpec {
  const scene = threeSceneKindData(threeNode, "threeScene", "orbit");
  const title = stringData(threeNode, "title", "Spatial astrology scene");
  const assetUrl = stringData(threeNode, "assetUrl", undefined);
  const renderMode = visualRenderModeData(threeNode, assetUrl ? "asset" : "contract");
  const description = stringData(
    threeNode,
    "description",
    "Use a Three.js contract for depth, orbit, and spatial emphasis."
  );

  return {
    id: stringData(threeNode, "sceneId", `scene-three-${scene}`),
    type: "three-scene",
    title,
    narration: stringData(
      threeNode,
      "narration",
      "The same concept can also become a spatial scene with planets, paths, and emphasis."
    ),
    durationSec: numberData(threeNode, "durationSec", 8),
    transition: "zoom",
    scene,
    data: jsonDataFromNode(threeNode, defaultThreeData(scene)),
    renderMode,
    assetId: stringData(threeNode, "assetId", assetUrl ? threeNode.refId : undefined),
    assetUrl,
    assetSource: stringData(threeNode, "provider", undefined),
    caption: {
      ...baseCaption,
      text: description
    },
    voice
  };
}

function sketchSceneFromNode(
  imageNode: CanvasNode,
  baseCaption: CaptionLayout,
  voice: VoiceSettings
): SceneSpec {
  const assetId = stringData(imageNode, "assetId", imageNode.refId);
  const title = stringData(imageNode, "title", "生活化比喻");
  const description = stringData(imageNode, "description", "把抽象概念变成生活画面");

  return {
    id: `scene-sketch-${assetId ?? "generated"}`,
    type: "sketch",
    title,
    narration: stringData(
      imageNode,
      "narration",
      "这张插画把抽象的占星概念转成更容易理解的生活画面。"
    ),
    durationSec: numberData(imageNode, "durationSec", 10),
    transition: "wipe",
    prompt: stringData(imageNode, "prompt", "简洁的占星教学插画，清晰表达核心概念"),
    assetId,
    assetUrl: stringData(imageNode, "assetUrl", undefined),
    assetSource: stringData(imageNode, "provider", undefined),
    caption: {
      ...baseCaption,
      text: description
    },
    voice
  };
}

function chartSceneFromNode(
  chartNode: CanvasNode,
  baseCaption: CaptionLayout,
  voice: VoiceSettings,
  canvas?: CanvasDocument
): SceneSpec {
  const chartId = stringData(chartNode, "refId", "chart-generated");
  const title = stringData(chartNode, "title", "星盘重点");
  const description = stringData(chartNode, "description", "上升点高亮");

  return {
    id: `scene-chart-${chartId}`,
    type: "astro-chart",
    title,
    narration: stringData(
      chartNode,
      "narration",
      "这张星盘根据出生时间和地点生成，用来定位上升点和行星落点。"
    ),
    durationSec: numberData(chartNode, "durationSec", 10),
    transition: "zoom",
    chartId,
    chartAssetId: stringData(chartNode, "assetId", undefined),
    chartAssetUrl: stringData(chartNode, "assetUrl", undefined),
    chartSvg: chartSvgFromNode(chartNode),
    chartSource: stringData(chartNode, "source", undefined),
    positions: chartPositionsFromNode(chartNode),
    houses: chartHousesFromNode(chartNode),
    calculation: chartCalculationFromNode(chartNode),
    highlights: chartHighlightsFromNodes(
      [chartNode],
      stringData(chartNode, "highlight", "ascendant"),
      stringData(chartNode, "highlightLabel", defaultAscendantHighlightLabel),
      canvas ? findChartHighlightNodes(canvas, chartNode) : []
    ),
    caption: {
      ...baseCaption,
      text: description
    },
    voice
  };
}

function compileFallbackScenes(
  canvas: CanvasDocument,
  caption: CaptionLayout,
  voice: VoiceSettings,
  scriptNode?: CanvasNode
): SceneSpec[] {
  const sceneNode = findNode(canvas, "scene");
  const captionNode = findNode(canvas, "caption");
  const chartNode = findNode(canvas, "chart");
  const imageNode = findNode(canvas, "image");
  const d3Node = findNode(canvas, "d3");
  const threeNode = findNode(canvas, "three");
  const introNarration = stringData(
    scriptNode,
    "scriptText",
    "你有没有发现，有些人一出现，就会给人很鲜明的第一印象？"
  );
  const sceneTitle = stringData(sceneNode, "title", "开场问题");
  const sceneDescription = stringData(sceneNode, "description", "第一印象从哪里来？");

  const scenes: SceneSpec[] = [
    {
      id: "scene-text-intro",
      type: "text",
      title: sceneTitle,
      narration: introNarration,
      durationSec: 8,
      transition: "fade",
      headline: sceneDescription,
      body: stringData(scriptNode, "tone", "适合小白的温和讲解"),
      caption: {
        ...caption,
        text: stringData(captionNode, "description", sceneDescription)
      },
      voice
    },
    {
      id: "scene-chart",
      type: "astro-chart",
      title: stringData(chartNode, "title", "星盘重点"),
      narration: "上升星座，就是你出生那一刻，东方地平线上正在升起的星座。",
      durationSec: 10,
      transition: "zoom",
      chartId: stringData(chartNode, "refId", "chart-ascendant-demo"),
      chartAssetId: stringData(chartNode, "assetId", undefined),
      chartAssetUrl: stringData(chartNode, "assetUrl", undefined),
      chartSvg: chartSvgFromNode(chartNode),
      chartSource: stringData(chartNode, "source", undefined),
      positions: chartPositionsFromNode(chartNode),
      houses: chartHousesFromNode(chartNode),
      calculation: chartCalculationFromNode(chartNode),
      highlights: chartHighlightsFromNodes(
        [chartNode],
        stringData(chartNode, "highlight", "ascendant"),
        stringData(chartNode, "highlightLabel", defaultAscendantHighlightLabel),
        findChartHighlightNodes(canvas, chartNode)
      ),
      caption: {
        ...caption,
        text: stringData(chartNode, "description", "上升点高亮")
      },
      voice
    },
    {
      id: "scene-sketch",
      type: "sketch",
      title: stringData(imageNode, "title", "生活化比喻"),
      narration: "你可以把它理解成一个人走进世界时，最先被别人看到的打开方式。",
      durationSec: 12,
      transition: "wipe",
      prompt: stringData(
        imageNode,
        "prompt",
        "简洁线稿插画：一个人推开门走进星空房间，画面温暖清晰"
      ),
      assetId: stringData(imageNode, "assetId", imageNode?.refId),
      assetUrl: stringData(imageNode, "assetUrl", undefined),
      assetSource: stringData(imageNode, "provider", undefined),
      caption: {
        ...caption,
        text: stringData(imageNode, "description", "它像你走进世界的开场方式")
      },
      voice
    }
  ];

  if (d3Node) {
    scenes.push(d3DiagramSceneFromNode(d3Node, caption, voice));
  }

  if (threeNode) {
    scenes.push(threeSceneFromNode(threeNode, caption, voice));
  }

  return scenes;
}

function captionForScene(
  baseCaption: CaptionLayout,
  sceneNode: CanvasNode,
  resources: SceneResourceNodes
): CaptionLayout {
  const { captionNode, compositionNode } = resources;

  if (!booleanData(compositionNode, "includeCaption", true)) {
    return {
      ...baseCaption,
      cues: []
    };
  }

  return {
    ...baseCaption,
    ...captionFromNode(captionNode),
    text: stringData(captionNode, "description", stringData(sceneNode, "caption", undefined))
  };
}

function findSceneResources(canvas: CanvasDocument, sceneNode: CanvasNode): SceneResourceNodes {
  const chartNode = findSceneResourceNode(canvas, sceneNode, "chart");

  return {
    captionNode: findSceneResourceNode(canvas, sceneNode, "caption"),
    chartNode,
    chartHighlightNodes: findChartHighlightNodes(canvas, chartNode, sceneNode),
    imageNode: findSceneResourceNode(canvas, sceneNode, "image"),
    d3Node: findSceneResourceNode(canvas, sceneNode, "d3"),
    threeNode: findSceneResourceNode(canvas, sceneNode, "three"),
    voiceNode: findSceneResourceNode(canvas, sceneNode, "voice"),
    compositionNode: findSceneResourceNode(canvas, sceneNode, "composition")
  };
}

function findSceneResourceNode(
  canvas: CanvasDocument,
  sceneNode: CanvasNode,
  kind: CanvasNode["kind"]
) {
  const sceneId = sceneNode.refId ?? sceneNode.id;

  return canvas.nodes.find(
    (node) =>
      node.kind === kind &&
      (node.data.sceneId === sceneId ||
        node.data.sourceSceneNodeId === sceneNode.id ||
        node.refId === `${kind}-${sceneId}`)
  );
}

function findChartHighlightNodes(
  canvas: CanvasDocument,
  chartNode: CanvasNode | undefined,
  sceneNode?: CanvasNode
) {
  if (!chartNode) {
    return [];
  }

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
        isChartHighlightChildNode(node, chartIds, linkedHighlightIds) &&
        isChartHighlightScopedToScene(node, sceneNode)
    )
    .sort(compareChartHighlightNodes);
}

function isChartHighlightChildNode(
  node: CanvasNode,
  chartIds: Set<string>,
  linkedHighlightIds: Set<string>
) {
  if (linkedHighlightIds.has(node.id)) {
    return true;
  }

  const parentIds = [
    stringData(node, "chartId", undefined),
    stringData(node, "chartNodeId", undefined),
    stringData(node, "sourceChartNodeId", undefined),
    stringData(node, "parentNodeId", undefined)
  ];

  return parentIds.some((id) => id !== undefined && chartIds.has(id));
}

function isChartHighlightScopedToScene(node: CanvasNode, sceneNode: CanvasNode | undefined) {
  if (!sceneNode) {
    return true;
  }

  const scopedSceneId = stringData(
    node,
    "sceneId",
    stringData(node, "sourceSceneNodeId", stringData(node, "sceneNodeId", undefined))
  );

  if (!scopedSceneId) {
    return true;
  }

  return scopedSceneId === sceneNode.id || scopedSceneId === sceneNode.refId;
}

function compareChartHighlightNodes(left: CanvasNode, right: CanvasNode) {
  const leftStart = optionalNumberData(left, "startSec") ?? optionalNumberData(left, "timeSec");
  const rightStart = optionalNumberData(right, "startSec") ?? optionalNumberData(right, "timeSec");

  if (leftStart !== undefined || rightStart !== undefined) {
    return (leftStart ?? Number.MAX_SAFE_INTEGER) - (rightStart ?? Number.MAX_SAFE_INTEGER);
  }

  return left.position.y - right.position.y || left.position.x - right.position.x;
}

function inferAutoSceneType(
  sceneNode: CanvasNode,
  resources: SceneResourceNodes,
  explicitSceneType?: string
): SceneSpec["type"] {
  if (resources.imageNode) {
    return "sketch";
  }

  if (resources.chartNode) {
    return "astro-chart";
  }

  if (resources.d3Node) {
    return "d3-diagram";
  }

  if (resources.threeNode) {
    return "three-scene";
  }

  if (explicitSceneType === "astro-chart") {
    return "astro-chart";
  }

  if (explicitSceneType === "sketch") {
    return "sketch";
  }

  if (explicitSceneType === "d3-diagram") {
    return "d3-diagram";
  }

  if (explicitSceneType === "three-scene") {
    return "three-scene";
  }

  return "text";
}

function sceneTypeFromComposition(resources: SceneResourceNodes): SceneSpec["type"] | undefined {
  const visualKind = compositionVisualKindData(resources.compositionNode);

  if (visualKind === "text") {
    return "text";
  }

  if (visualKind === "chart") {
    return "astro-chart";
  }

  if (visualKind === "image" && resources.imageNode) {
    return "sketch";
  }

  if (visualKind === "d3" && resources.d3Node) {
    return "d3-diagram";
  }

  if (visualKind === "three" && resources.threeNode) {
    return "three-scene";
  }

  return undefined;
}

function visualLayersFromComposition(
  sceneNode: CanvasNode,
  resources: SceneResourceNodes,
  primarySceneType: SceneSpec["type"]
): VisualLayer[] {
  const secondaryVisualKind = compositionSecondaryVisualKindData(resources.compositionNode);

  if (secondaryVisualKind === "none") {
    return [];
  }

  if (secondaryVisualKind === "chart" && primarySceneType !== "astro-chart") {
    return [chartVisualLayerFromNode(resources.chartNode ?? sceneNode)];
  }

  if (secondaryVisualKind === "image" && primarySceneType !== "sketch" && resources.imageNode) {
    return [imageVisualLayerFromNode(resources.imageNode)];
  }

  return [];
}

function chartVisualLayerFromNode(node: CanvasNode): VisualLayer {
  return {
    kind: "chart",
    title: stringData(node, "title", "星盘"),
    assetId: stringData(node, "assetId", undefined),
    assetUrl: stringData(node, "assetUrl", undefined),
    assetSource: stringData(node, "provider", stringData(node, "source", undefined))
  };
}

function imageVisualLayerFromNode(node: CanvasNode): VisualLayer {
  return {
    kind: "image",
    title: stringData(node, "title", "图像"),
    assetId: stringData(node, "assetId", undefined),
    assetUrl: stringData(node, "assetUrl", undefined),
    assetSource: stringData(node, "provider", stringData(node, "source", undefined))
  };
}

function findGlobalNode(canvas: CanvasDocument, kind: CanvasNode["kind"]) {
  return canvas.nodes.find((node) => node.kind === kind && !isSceneScopedNode(node));
}

function isSceneScopedNode(node: CanvasNode) {
  return typeof node.data.sceneId === "string" || typeof node.data.sourceSceneNodeId === "string";
}

function findNode(canvas: CanvasDocument, kind: CanvasNode["kind"]) {
  return canvas.nodes.find((node) => node.kind === kind);
}

function captionFromNode(node?: CanvasNode): CaptionLayout {
  return {
    text: stringData(node, "description", undefined),
    assetId: stringData(node, "assetId", undefined),
    assetScope: stringData(node, "assetScope", undefined) === "library" ? "library" : "project",
    assetUrl: stringData(node, "assetUrl", undefined),
    provider: stringData(node, "provider", undefined),
    cues: captionCuesFromNode(node),
    yPercent: numberData(node, "yPercent", defaultCaption.yPercent),
    fontSize: numberData(node, "fontSize", defaultCaption.fontSize),
    color: stringData(node, "color", defaultCaption.color),
    animation: defaultCaption.animation
  };
}

function captionCuesFromNode(node?: CanvasNode): CaptionCue[] {
  const value = node?.data.cues;

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index): CaptionCue | undefined => {
      if (!item || typeof item !== "object") {
        return undefined;
      }

      const cue = item as Record<string, unknown>;
      const text = typeof cue.text === "string" ? cue.text.trim() : "";
      const startSec = typeof cue.startSec === "number" && Number.isFinite(cue.startSec)
        ? cue.startSec
        : 0;
      const durationSec =
        typeof cue.durationSec === "number" && Number.isFinite(cue.durationSec)
          ? cue.durationSec
          : undefined;

      if (!text || durationSec === undefined || durationSec <= 0) {
        return undefined;
      }

      return {
        id: typeof cue.id === "string" && cue.id.length > 0 ? cue.id : `cue-${index + 1}`,
        text,
        startSec: Math.max(0, startSec),
        durationSec
      };
    })
    .filter((cue): cue is CaptionCue => Boolean(cue));
}

function audioTracksFromCanvas(
  canvas: CanvasDocument,
  scenes: SceneSpec[],
  globalVoiceNode: CanvasNode | undefined,
  globalVoice: VoiceSettings
) {
  const sceneStarts = new Map<string, number>();
  let cursor = 0;

  for (const scene of scenes) {
    sceneStarts.set(scene.id, cursor);
    cursor += scene.durationSec;
  }

  const sceneVoiceTracks = canvas.nodes
    .filter((node) => node.kind === "voice" && isSceneScopedNode(node))
    .flatMap((node) => {
      const sceneId = stringData(node, "sceneId", undefined);
      const scene = sceneId ? scenes.find((item) => item.id === sceneId) : undefined;
      const compositionNode = findCompositionForScopedNode(canvas, node);

      if (!booleanData(compositionNode, "includeVoice", true)) {
        return [];
      }

      return audioTracksFromNode(
        node,
        voiceFromNode(node),
        sceneId ? (sceneStarts.get(sceneId) ?? 0) : 0,
        scene?.durationSec
      );
    });

  if (sceneVoiceTracks.length > 0) {
    return sceneVoiceTracks;
  }

  return audioTracksFromNode(globalVoiceNode, globalVoice);
}

function findCompositionForScopedNode(canvas: CanvasDocument, scopedNode: CanvasNode) {
  const sceneId = stringData(scopedNode, "sceneId", undefined);
  const sourceSceneNodeId = stringData(scopedNode, "sourceSceneNodeId", undefined);

  return canvas.nodes.find(
    (node) =>
      node.kind === "composition" &&
      ((sceneId && node.data.sceneId === sceneId) ||
        (sourceSceneNodeId && node.data.sourceSceneNodeId === sourceSceneNodeId))
  );
}

function audioTracksFromNode(
  node: CanvasNode | undefined,
  voice: VoiceSettings,
  startSec = 0,
  durationSec?: number
): AudioTrack[] {
  if (!node) {
    return [];
  }

  const assetId = stringData(node, "assetId", node?.refId ?? "asset-audio-placeholder");
  const assetUrl = stringData(node, "assetUrl", undefined);

  return [
    {
      id: `track-${assetId}`,
      assetId,
      assetScope: "project",
      assetUrl,
      provider: stringData(node, "provider", undefined),
      kind: "narration",
      startSec,
      durationSec,
      volume: voice.volume,
      playbackRate: voice.speed
    }
  ];
}

function hasLegacyRenderableNodes(canvas: CanvasDocument) {
  return canvas.nodes.some((node) =>
    ["scene", "chart", "image", "d3", "three"].includes(node.kind)
  );
}

function voiceFromNode(node?: CanvasNode): VoiceSettings {
  return {
    voiceProfileAssetId: node?.refId,
    speed: numberData(node, "speed", defaultVoice.speed),
    volume: numberData(node, "volume", defaultVoice.volume),
    emotion: stringData(node, "emotion", undefined)
  };
}

function chartSvgFromNode(node: CanvasNode | undefined) {
  return stringData(node, "chartSvg", stringData(node, "svg", undefined));
}

function chartPositionsFromNode(node: CanvasNode | undefined): AstroChartPosition[] {
  const rawPositions = node?.data.positions;

  if (!Array.isArray(rawPositions)) {
    return [];
  }

  return rawPositions.flatMap((position) => {
    const parsed = astroChartPositionSchema.safeParse(position);
    return parsed.success ? [parsed.data] : [];
  });
}

function chartHousesFromNode(node: CanvasNode | undefined): AstroChartHouse[] {
  const rawHouses = node?.data.houses;

  if (!Array.isArray(rawHouses)) {
    return [];
  }

  return rawHouses.flatMap((house) => {
    const parsed = astroChartHouseSchema.safeParse(house);
    return parsed.success ? [parsed.data] : [];
  });
}

function chartCalculationFromNode(node: CanvasNode | undefined): AstroChartCalculation | undefined {
  const parsed = astroChartCalculationSchema.safeParse(node?.data.calculation);
  return parsed.success ? parsed.data : undefined;
}

function chartHighlightsFromNodes(
  nodes: Array<CanvasNode | undefined>,
  fallbackId: string,
  fallbackLabel: string,
  highlightNodes: CanvasNode[] = []
): AstroChartHighlight[] {
  const childHighlights = chartHighlightsFromHighlightNodes(highlightNodes);
  if (childHighlights.length > 0) {
    return childHighlights;
  }

  for (const node of nodes) {
    const highlights = chartHighlightsFromNode(node);
    if (highlights.length > 0) {
      return highlights;
    }
  }

  return [
    astroChartHighlightSchema.parse({
      kind: legacyChartHighlightKind(fallbackId),
      id: fallbackId,
      label: fallbackLabel
    })
  ];
}

function chartHighlightsFromHighlightNodes(nodes: CanvasNode[]): AstroChartHighlight[] {
  return nodes.flatMap((node) => {
    const id = stringData(
      node,
      "targetId",
      stringData(node, "highlightId", stringData(node, "highlight", "ascendant"))
    );
    const parsed = astroChartHighlightSchema.safeParse({
      kind: stringData(
        node,
        "highlightKind",
        stringData(node, "targetKind", legacyChartHighlightKind(id))
      ),
      id,
      targetId: stringData(
        node,
        "secondaryTargetId",
        stringData(node, "aspectTargetId", undefined)
      ),
      label: stringData(node, "label", stringData(node, "title", undefined)),
      style: stringData(node, "style", undefined),
      color: stringData(node, "color", undefined),
      emphasis: optionalNumberData(node, "emphasis"),
      startSec: optionalNumberData(node, "startSec") ?? optionalNumberData(node, "timeSec"),
      durationSec: optionalNumberData(node, "durationSec")
    });

    return parsed.success ? [parsed.data] : [];
  });
}

function chartHighlightsFromNode(node: CanvasNode | undefined): AstroChartHighlight[] {
  const rawHighlights = rawChartHighlightsFromNode(node);

  if (!rawHighlights) {
    return [];
  }

  return rawHighlights.flatMap((highlight) => {
    const parsed = astroChartHighlightSchema.safeParse(highlight);
    return parsed.success ? [parsed.data] : [];
  });
}

function rawChartHighlightsFromNode(node: CanvasNode | undefined) {
  const direct =
    node?.data.highlights ?? node?.data.chartHighlights ?? node?.data.timelineHighlights;

  if (Array.isArray(direct)) {
    return direct;
  }

  const json = stringData(node, "highlightsJson", undefined);
  if (!json) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function legacyChartHighlightKind(id: string): AstroChartHighlight["kind"] {
  const normalized = id.toLowerCase();

  if (chartAxisHighlightIds.includes(normalized as (typeof chartAxisHighlightIds)[number])) {
    return "axis";
  }

  if (chartPlanetHighlightIds.includes(normalized as (typeof chartPlanetHighlightIds)[number])) {
    return "planet";
  }

  if (/^(house-?|h)\d{1,2}$/.test(normalized)) {
    return "house";
  }

  return "zodiac";
}

function stringData(node: CanvasNode | undefined, key: string, fallback: string): string;
function stringData(
  node: CanvasNode | undefined,
  key: string,
  fallback: string | undefined
): string | undefined;
function stringData(node: CanvasNode | undefined, key: string, fallback: string | undefined) {
  if (key === "refId" && node?.refId) {
    return node.refId;
  }

  const value = node?.data[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function numberData(node: CanvasNode | undefined, key: string, fallback: number) {
  const value = node?.data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalNumberData(node: CanvasNode | undefined, key: string) {
  const value = node?.data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function compactStringSet(values: Array<string | undefined>) {
  return new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0));
}

function d3DiagramKindData(
  node: CanvasNode | undefined,
  key: string,
  fallback: D3DiagramSceneSpec["diagram"]
) {
  const value = stringData(node, key, fallback);
  return d3DiagramKinds.includes(value as D3DiagramSceneSpec["diagram"])
    ? (value as D3DiagramSceneSpec["diagram"])
    : fallback;
}

function threeSceneKindData(
  node: CanvasNode | undefined,
  key: string,
  fallback: ThreeSceneSpec["scene"]
) {
  const value = stringData(node, key, fallback);
  return threeSceneKinds.includes(value as ThreeSceneSpec["scene"])
    ? (value as ThreeSceneSpec["scene"])
    : fallback;
}

function visualRenderModeData(
  node: CanvasNode | undefined,
  fallback: VisualRenderMode
): VisualRenderMode {
  const value = stringData(node, "renderMode", fallback);
  return value === "asset" ? "asset" : "contract";
}

function compositionVisualKindData(node: CanvasNode | undefined): CompositionVisualKind {
  const value = stringData(node, "primaryVisualKind", stringData(node, "visualKind", "auto"));
  return compositionVisualKinds.includes(value as CompositionVisualKind)
    ? (value as CompositionVisualKind)
    : "auto";
}

function compositionSecondaryVisualKindData(
  node: CanvasNode | undefined
): CompositionSecondaryVisualKind {
  const value = stringData(node, "secondaryVisualKind", "none");
  return compositionSecondaryVisualKinds.includes(value as CompositionSecondaryVisualKind)
    ? (value as CompositionSecondaryVisualKind)
    : "none";
}

function transitionData(node: CanvasNode | undefined, fallback: Transition): Transition {
  const value = stringData(node, "transition", fallback);
  return transitions.includes(value as Transition) ? (value as Transition) : fallback;
}

function layoutPresetData(node: CanvasNode | undefined): SceneLayoutPreset {
  const value = stringData(node, "layoutPreset", "single");
  return layoutPresets.includes(value as SceneLayoutPreset) ? (value as SceneLayoutPreset) : "single";
}

function booleanData(node: CanvasNode | undefined, key: string, fallback: boolean) {
  const value = node?.data[key];
  return typeof value === "boolean" ? value : fallback;
}

function jsonDataFromNode(node: CanvasNode, fallback: unknown) {
  const directData = node.data.data;

  if (directData !== undefined) {
    return directData;
  }

  const json = stringData(node, "dataJson", undefined);
  if (!json) {
    return fallback;
  }

  try {
    return JSON.parse(json) as unknown;
  } catch {
    return fallback;
  }
}

function defaultD3Data(diagram: D3DiagramSceneSpec["diagram"]) {
  if (diagram === "tree") {
    return {
      root: "Ascendant",
      children: ["First impression", "Body language", "Initial response"]
    };
  }

  if (diagram === "relationship") {
    return {
      nodes: ["Birth moment", "Eastern horizon", "Rising sign", "First impression"],
      links: [
        ["Birth moment", "Eastern horizon"],
        ["Eastern horizon", "Rising sign"],
        ["Rising sign", "First impression"]
      ]
    };
  }

  if (diagram === "distribution") {
    return {
      values: [
        { label: "Outer response", value: 42 },
        { label: "Expression style", value: 34 },
        { label: "First impression", value: 24 }
      ]
    };
  }

  return {
    events: [
      { label: "Birth time", value: 0 },
      { label: "Eastern horizon", value: 1 },
      { label: "Rising sign", value: 2 },
      { label: "First impression", value: 3 }
    ]
  };
}

function defaultThreeData(scene: ThreeSceneSpec["scene"]) {
  return {
    preset: scene,
    camera: "portrait-orbit",
    speed: 0.72,
    accentColor: "#e8c164",
    focus: scene === "planet-focus" ? "Sun" : "Ascendant"
  };
}
