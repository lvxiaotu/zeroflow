"use client";

import type { CanvasDocument, CanvasNode, CanvasNodeKind } from "@zeroflow/core";
import {
  createShapeId,
  toRichText,
  type Editor,
  type TLArrowShape,
  type TLShape,
  type TLShapeId
} from "tldraw";
import { type ZeroFlowNodeShape, zeroFlowNodeShapeType } from "./ZeroFlowNodeShape";

export const nodeShapeMetaKey = "zeroflowNodeId";
export const edgeShapeMetaKey = "zeroflowEdgeId";

const kindLabels: Record<CanvasNodeKind, string> = {
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
  d3: "D3 Diagram",
  three: "三维场景",
  music: "音乐",
  composition: "画面合成",
  preview: "预览",
  export: "导出"
};

const actionLabels: Partial<Record<CanvasNodeKind, string>> = {
  topic: "生成文案",
  script: "生成分镜",
  structure: "生成章节",
  storyboard: "生成分镜",
  chapter: "展开分镜",
  caption: "对齐字幕",
  voice: "生成配音",
  chart: "生成星盘",
  image: "生成简笔画",
  composition: "创建预览",
  preview: "渲染静帧"
};

export function loadCanvasIntoTldraw(editor: Editor, canvas: CanvasDocument) {
  editor.store.mergeRemoteChanges(() => {
    const currentShapes = editor.getCurrentPageShapes();

    if (currentShapes.length > 0) {
      editor.deleteShapes(currentShapes.map((shape) => shape.id));
    }

    editor.createShapes(canvas.nodes.map((node) => nodeToZeroFlowNodeShape(node, canvas)));
    syncTldrawEdges(editor, canvas);
    editor.zoomToFit();
  });
}

export function syncTldrawEdges(editor: Editor, canvas: CanvasDocument) {
  editor.store.mergeRemoteChanges(() => {
    const shapes = editor.getCurrentPageShapes();
    const existingEdgeIds = shapes.filter(isZeroFlowArrowShape).map((shape) => shape.id);

    if (existingEdgeIds.length > 0) {
      editor.deleteShapes(existingEdgeIds);
    }

    const nodeShapes = new Map<string, ZeroFlowNodeShape>();

    for (const shape of editor.getCurrentPageShapes()) {
      if (isZeroFlowNodeShape(shape)) {
        nodeShapes.set(String(shape.meta[nodeShapeMetaKey]), shape);
      }
    }

    const edgeShapes = canvas.edges.flatMap((edge) => {
      const fromShape = nodeShapes.get(edge.fromNodeId);
      const toShape = nodeShapes.get(edge.toNodeId);

      if (!fromShape || !toShape) {
        return [];
      }

      return [edgeToArrowShape(edge.id, edge.relation, fromShape, toShape)];
    });

    if (edgeShapes.length > 0) {
      editor.createShapes(edgeShapes);
    }

    keepEdgesBehindNodes(editor);
  });
}

export function canvasFromTldraw(editor: Editor, baseCanvas: CanvasDocument): CanvasDocument {
  const nodeShapes = new Map<string, ZeroFlowNodeShape>();

  for (const shape of editor.getCurrentPageShapes()) {
    if (isZeroFlowNodeShape(shape)) {
      nodeShapes.set(String(shape.meta[nodeShapeMetaKey]), shape);
    }
  }

  return {
    ...baseCanvas,
    nodes: baseCanvas.nodes.map((node) => {
      const shape = nodeShapes.get(node.id);

      if (!shape) {
        return node;
      }

      return {
        ...node,
        position: {
          x: roundCanvasNumber(shape.x),
          y: roundCanvasNumber(shape.y)
        },
        size: {
          width: Math.max(120, roundCanvasNumber(shape.props.w)),
          height: Math.max(88, roundCanvasNumber(shape.props.h))
        }
      };
    })
  };
}

export function getSelectedZeroFlowNodeIds(editor: Editor) {
  return editor
    .getSelectedShapes()
    .filter(isZeroFlowNodeShape)
    .map((shape) => String(shape.meta[nodeShapeMetaKey]));
}

export function isZeroFlowNodeShape(shape: TLShape): shape is ZeroFlowNodeShape {
  return shape.type === zeroFlowNodeShapeType && typeof shape.meta[nodeShapeMetaKey] === "string";
}

export function updateTldrawNodeShape(editor: Editor, node: CanvasNode, canvas?: CanvasDocument) {
  const shape = editor
    .getCurrentPageShapes()
    .find((item) => isZeroFlowNodeShape(item) && item.props.nodeId === node.id);

  if (!shape) {
    return;
  }

  editor.updateShape({
    id: shape.id,
    type: zeroFlowNodeShapeType,
    props: zeroFlowNodeShapePropsFromNode(node, canvas)
  });
}

export function updateTldrawNodeShapes(editor: Editor, canvas: CanvasDocument) {
  for (const node of canvas.nodes) {
    updateTldrawNodeShape(editor, node, canvas);
  }
}

function nodeToZeroFlowNodeShape(node: CanvasNode, canvas: CanvasDocument) {
  return {
    id: nodeShapeId(node.id),
    type: zeroFlowNodeShapeType,
    x: node.position.x,
    y: node.position.y,
    opacity: node.status === "failed" ? 0.7 : 1,
    props: zeroFlowNodeShapePropsFromNode(node, canvas),
    meta: {
      [nodeShapeMetaKey]: node.id,
      zeroflowNodeKind: node.kind
    }
  };
}

function zeroFlowNodeShapePropsFromNode(
  node: CanvasNode,
  canvas?: CanvasDocument
): ZeroFlowNodeShape["props"] {
  const actionLabel = nodeActionLabel(node);
  const assetUrl = nodeAssetUrl(node);
  const scenePreview = getScenePreviewProps(node, canvas);
  const displaySize = nodeDisplaySize(node, assetUrl, scenePreview);

  return {
    w: displaySize.width,
    h: displaySize.height,
    nodeId: node.id,
    kind: node.kind,
    status: node.status,
    title: nodeTitle(node),
    description: nodeDescription(node),
    refId: node.refId ?? stringData(node.data.assetId) ?? stringData(node.data.chartAssetId) ?? "",
    assetUrl,
    assetKind: nodeAssetKind(node, assetUrl),
    provider: nodeProvider(node),
    cueCount: nodeCueCount(node),
    durationSec: nodeDurationSec(node),
    scenePreviewAssetUrl: scenePreview.assetUrl,
    scenePreviewAssetKind: scenePreview.assetKind,
    scenePreviewCaption: scenePreview.caption,
    actionLabel,
    hasAction: actionLabel.length > 0
  };
}

function nodeDisplaySize(
  node: CanvasNode,
  assetUrl: string,
  scenePreview: ReturnType<typeof getScenePreviewProps>
) {
  if (node.kind === "scene" && (scenePreview.assetUrl || scenePreview.caption)) {
    return {
      width: Math.max(node.size.width, 360),
      height: Math.max(node.size.height, 300)
    };
  }

  if (assetUrl && (node.kind === "chart" || node.kind === "image" || node.kind === "d3" || node.kind === "three")) {
    return {
      width: Math.max(node.size.width, 360),
      height: Math.max(node.size.height, 280)
    };
  }

  return node.size;
}

function getScenePreviewProps(node: CanvasNode, canvas: CanvasDocument | undefined) {
  if (node.kind !== "scene" || !canvas) {
    return {
      assetUrl: "",
      assetKind: "",
      caption: ""
    };
  }

  const visualNode = findSceneVisualPreviewNode(canvas, node);
  const assetUrl = visualNode ? nodeAssetUrl(visualNode) : "";
  const captionNode = findSceneResourceNode(canvas, node, "caption");

  return {
    assetUrl,
    assetKind: visualNode ? nodeAssetKind(visualNode, assetUrl) : "",
    caption: sceneCaptionText(captionNode)
  };
}

function nodeActionLabel(node: CanvasNode) {
  if (node.kind === "export") {
    return stringData(node.data.exportScope) === "full" ? "Render full video" : "Render clip";
  }

  if (node.kind === "script" && (numberData(node.data.targetDurationSec) ?? 0) > 60) {
    return "生成结构";
  }

  return actionLabels[node.kind] ?? "";
}

function edgeToArrowShape(
  edgeId: string,
  relation: string,
  fromShape: ZeroFlowNodeShape,
  toShape: ZeroFlowNodeShape
) {
  return {
    id: edgeShapeId(edgeId),
    type: "arrow" as const,
    x: 0,
    y: 0,
    isLocked: true,
    opacity: 0.24,
    props: {
      start: {
        x: fromShape.x + fromShape.props.w,
        y: fromShape.y + fromShape.props.h / 2
      },
      end: {
        x: toShape.x,
        y: toShape.y + toShape.props.h / 2
      },
      arrowheadEnd: "arrow" as const,
      richText: toRichText("")
    },
    meta: {
      [edgeShapeMetaKey]: edgeId,
      zeroflowEdgeRelation: relation
    }
  };
}

function isZeroFlowArrowShape(shape: TLShape): shape is TLArrowShape {
  return shape.type === "arrow" && typeof shape.meta[edgeShapeMetaKey] === "string";
}

function keepEdgesBehindNodes(editor: Editor) {
  const shapes = editor.getCurrentPageShapes();
  const edgeIds = shapes.filter(isZeroFlowArrowShape).map((shape) => shape.id);
  const nodeIds = shapes.filter(isZeroFlowNodeShape).map((shape) => shape.id);

  if (edgeIds.length > 0) {
    editor.sendToBack(edgeIds);
  }

  if (nodeIds.length > 0) {
    editor.bringToFront(nodeIds);
  }
}

function nodeShapeId(nodeId: string): TLShapeId {
  return createShapeId(`zeroflow-node-${nodeId}`);
}

function edgeShapeId(edgeId: string): TLShapeId {
  return createShapeId(`zeroflow-edge-${edgeId}`);
}

function nodeTitle(node: CanvasNode) {
  return compactText(stringData(node.data.title) ?? kindLabels[node.kind], 58);
}

function nodeDescription(node: CanvasNode) {
  const caption = recordData(node.data.caption);
  const candidates = [
    stringData(node.data.description),
    stringData(node.data.prompt),
    stringData(node.data.visualPrompt),
    stringData(node.data.narration),
    stringData(node.data.summary),
    stringData(node.data.chapterScriptText),
    stringData(node.data.scriptText),
    typeof node.data.caption === "string" ? node.data.caption : undefined,
    stringData(caption?.text)
  ];

  return compactText(candidates.find((value) => value && value.trim().length > 0) ?? "", 140);
}

function nodeAssetUrl(node: CanvasNode) {
  const caption = recordData(node.data.caption);
  const candidates = [
    stringData(node.data.assetUrl),
    stringData(node.data.chartAssetUrl),
    stringData(node.data.imageAssetUrl),
    stringData(caption?.assetUrl)
  ];

  return candidates.find((value) => value && value.length > 0) ?? "";
}

function nodeAssetKind(node: CanvasNode, assetUrl: string) {
  if (!assetUrl) {
    return "";
  }

  if (node.kind === "chart") {
    return "chart";
  }

  if (node.kind === "image" || node.kind === "scene") {
    return "image";
  }

  if (node.kind === "d3" || node.kind === "three") {
    return "visual";
  }

  if (node.kind === "voice") {
    return "voice";
  }

  if (node.kind === "caption") {
    return "caption";
  }

  return "asset";
}

type ScenePreviewResourceKind = Extract<
  CanvasNodeKind,
  "caption" | "chart" | "image" | "d3" | "three"
>;

const scenePreviewVisualKinds: ScenePreviewResourceKind[] = ["image", "chart", "d3", "three"];

function findSceneVisualPreviewNode(canvas: CanvasDocument, sceneNode: CanvasNode) {
  return scenePreviewVisualKinds
    .map((kind) => findSceneResourceNode(canvas, sceneNode, kind))
    .find((node): node is CanvasNode => Boolean(node && nodeAssetUrl(node)));
}

function findSceneResourceNode(
  canvas: CanvasDocument,
  sceneNode: CanvasNode,
  kind: ScenePreviewResourceKind
) {
  const sceneId = sceneNode.refId ?? sceneNode.id;
  const safeSceneRefId = `${kind}-${safeId(sceneId)}`;
  const directSceneRefId = `${kind}-${sceneId}`;

  return canvas.nodes.find(
    (node) =>
      node.kind === kind &&
      (stringData(node.data.sourceSceneNodeId) === sceneNode.id ||
        stringData(node.data.sceneNodeId) === sceneNode.id ||
        stringData(node.data.sceneId) === sceneId ||
        node.refId === safeSceneRefId ||
        node.refId === directSceneRefId ||
        (kind === "caption" && node.refId === sceneId))
  );
}

function sceneCaptionText(captionNode: CanvasNode | undefined) {
  if (!captionNode) {
    return "";
  }

  const caption = recordData(captionNode.data.caption);
  const cueText = firstCueText(arrayData(captionNode.data.cues) ?? arrayData(caption?.cues));
  const candidates = [
    stringData(captionNode.data.description),
    stringData(captionNode.data.text),
    typeof captionNode.data.caption === "string" ? captionNode.data.caption : undefined,
    stringData(caption?.text),
    cueText
  ];

  return compactText(candidates.find((value) => value && value.trim().length > 0) ?? "", 96);
}

function firstCueText(cues: unknown[] | undefined) {
  const firstCue = cues
    ?.map((cue) => recordData(cue))
    .find((cue) => typeof cue?.text === "string" && cue.text.trim().length > 0);

  return typeof firstCue?.text === "string" ? firstCue.text : undefined;
}

function nodeProvider(node: CanvasNode) {
  const caption = recordData(node.data.caption);
  return (
    stringData(node.data.provider) ??
    stringData(caption?.provider) ??
    stringData(node.data.generatedBy) ??
    ""
  );
}

function nodeCueCount(node: CanvasNode) {
  const caption = recordData(node.data.caption);
  const directCueCount = numberData(node.data.cueCount);

  if (directCueCount) {
    return directCueCount;
  }

  const directCues = arrayData(node.data.cues);
  if (directCues) {
    return directCues.length;
  }

  const captionCues = arrayData(caption?.cues);
  return captionCues?.length ?? 0;
}

function nodeDurationSec(node: CanvasNode) {
  const caption = recordData(node.data.caption);
  return numberData(node.data.durationSec) ?? numberData(caption?.durationSec) ?? 0;
}

function stringData(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function numberData(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function arrayData(value: unknown) {
  return Array.isArray(value) ? value : undefined;
}

function recordData(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function compactText(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, limit - 1))}...`;
}

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function roundCanvasNumber(value: number) {
  return Math.round(value * 100) / 100;
}
