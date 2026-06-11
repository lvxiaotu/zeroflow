import { z } from "zod";
import {
  canvasDocumentSchema,
  canvasEdgeRelationSchema,
  canvasNodeKindSchema,
  canvasNodeStatusSchema,
  type CanvasDocument,
  type CanvasEdge,
  type CanvasNode
} from "../schema/canvas";
import { idSchema, metadataSchema } from "../schema/primitives";

export const zeroflowTlNodeShapeType = "zeroflow-node" as const;
export const zeroflowTlEdgeShapeType = "zeroflow-edge" as const;

const tlBaseShapeSchema = z.object({
  id: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  rotation: z.number().finite().default(0),
  index: z.string().min(1),
  parentId: z.string().optional(),
  isLocked: z.boolean().default(false),
  opacity: z.number().min(0).max(1).default(1)
});

export const tldrawCompatNodeShapeSchema = tlBaseShapeSchema.extend({
  type: z.literal(zeroflowTlNodeShapeType),
  props: z.object({
    nodeId: idSchema,
    kind: canvasNodeKindSchema,
    refId: idSchema.optional(),
    w: z.number().positive(),
    h: z.number().positive(),
    status: canvasNodeStatusSchema.default("idle"),
    data: metadataSchema.default({})
  })
});

export const tldrawCompatEdgeShapeSchema = tlBaseShapeSchema.extend({
  type: z.literal(zeroflowTlEdgeShapeType),
  props: z.object({
    edgeId: idSchema,
    fromNodeId: idSchema,
    toNodeId: idSchema,
    fromShapeId: z.string().min(1),
    toShapeId: z.string().min(1),
    relation: canvasEdgeRelationSchema
  })
});

export const tldrawCompatShapeSchema = z.discriminatedUnion("type", [
  tldrawCompatNodeShapeSchema,
  tldrawCompatEdgeShapeSchema
]);

export const tldrawCompatSnapshotSchema = z.object({
  version: z.literal("1"),
  source: z.literal("zeroflow-canvas").default("zeroflow-canvas"),
  canvasVersion: z.literal("1").default("1"),
  viewport: z
    .object({
      x: z.number().finite(),
      y: z.number().finite(),
      zoom: z.number().positive()
    })
    .optional(),
  shapes: z.array(tldrawCompatShapeSchema)
});

export type TldrawCompatNodeShape = z.infer<typeof tldrawCompatNodeShapeSchema>;
export type TldrawCompatEdgeShape = z.infer<typeof tldrawCompatEdgeShapeSchema>;
export type TldrawCompatShape = z.infer<typeof tldrawCompatShapeSchema>;
export type TldrawCompatSnapshot = z.infer<typeof tldrawCompatSnapshotSchema>;

export type TldrawSnapshotToCanvasOptions = {
  fallbackDocument?: CanvasDocument;
  preserveFallbackEdges?: boolean;
};

export function canvasNodeIdToTldrawShapeId(nodeId: string) {
  return `shape:zeroflow-node:${encodeURIComponent(nodeId)}`;
}

export function canvasEdgeIdToTldrawShapeId(edgeId: string) {
  return `shape:zeroflow-edge:${encodeURIComponent(edgeId)}`;
}

export function canvasDocumentToTldrawSnapshot(canvas: CanvasDocument): TldrawCompatSnapshot {
  const parsed = canvasDocumentSchema.parse(canvas);
  const nodeShapes = parsed.nodes.map((node, index) => nodeToTldrawShape(node, index));
  const edgeShapes = parsed.edges.map((edge, index) =>
    edgeToTldrawShape(edge, parsed.nodes.length + index)
  );

  return tldrawCompatSnapshotSchema.parse({
    version: "1",
    source: "zeroflow-canvas",
    canvasVersion: parsed.version,
    viewport: parsed.viewport,
    shapes: [...nodeShapes, ...edgeShapes]
  });
}

export function tldrawSnapshotToCanvasDocument(
  snapshot: TldrawCompatSnapshot,
  options: TldrawSnapshotToCanvasOptions = {}
): CanvasDocument {
  const parsed = tldrawCompatSnapshotSchema.parse(snapshot);
  const nodeShapes = parsed.shapes.filter(isTldrawNodeShape);
  const nodeIds = new Set(nodeShapes.map((shape) => shape.props.nodeId));
  const edges = edgeShapesToCanvasEdges(parsed.shapes.filter(isTldrawEdgeShape), nodeIds, options);

  return canvasDocumentSchema.parse({
    version: "1",
    nodes: nodeShapes.map(tldrawNodeShapeToCanvasNode),
    edges,
    viewport: parsed.viewport ?? options.fallbackDocument?.viewport ?? { x: 0, y: 0, zoom: 1 }
  });
}

function nodeToTldrawShape(node: CanvasNode, index: number): TldrawCompatNodeShape {
  return {
    id: canvasNodeIdToTldrawShapeId(node.id),
    type: zeroflowTlNodeShapeType,
    x: node.position.x,
    y: node.position.y,
    rotation: 0,
    index: makeTldrawIndex(index),
    isLocked: false,
    opacity: 1,
    props: {
      nodeId: node.id,
      kind: node.kind,
      refId: node.refId,
      w: node.size.width,
      h: node.size.height,
      status: node.status,
      data: cloneMetadata(node.data)
    }
  };
}

function edgeToTldrawShape(edge: CanvasEdge, index: number): TldrawCompatEdgeShape {
  return {
    id: canvasEdgeIdToTldrawShapeId(edge.id),
    type: zeroflowTlEdgeShapeType,
    x: 0,
    y: 0,
    rotation: 0,
    index: makeTldrawIndex(index),
    isLocked: false,
    opacity: 1,
    props: {
      edgeId: edge.id,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      fromShapeId: canvasNodeIdToTldrawShapeId(edge.fromNodeId),
      toShapeId: canvasNodeIdToTldrawShapeId(edge.toNodeId),
      relation: edge.relation
    }
  };
}

function tldrawNodeShapeToCanvasNode(shape: TldrawCompatNodeShape): CanvasNode {
  return {
    id: shape.props.nodeId,
    kind: shape.props.kind,
    refId: shape.props.refId,
    position: {
      x: shape.x,
      y: shape.y
    },
    size: {
      width: shape.props.w,
      height: shape.props.h
    },
    status: shape.props.status,
    data: cloneMetadata(shape.props.data)
  };
}

function edgeShapesToCanvasEdges(
  edgeShapes: TldrawCompatEdgeShape[],
  nodeIds: Set<string>,
  options: TldrawSnapshotToCanvasOptions
): CanvasEdge[] {
  const parsedEdges = edgeShapes
    .map((shape) => tldrawEdgeShapeToCanvasEdge(shape, nodeIds))
    .filter((edge): edge is CanvasEdge => Boolean(edge));

  if (parsedEdges.length > 0 || options.preserveFallbackEdges === false) {
    return parsedEdges;
  }

  return (options.fallbackDocument?.edges ?? []).filter(
    (edge) => nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId)
  );
}

function tldrawEdgeShapeToCanvasEdge(
  shape: TldrawCompatEdgeShape,
  nodeIds: Set<string>
): CanvasEdge | undefined {
  if (!nodeIds.has(shape.props.fromNodeId) || !nodeIds.has(shape.props.toNodeId)) {
    return undefined;
  }

  return {
    id: shape.props.edgeId,
    fromNodeId: shape.props.fromNodeId,
    toNodeId: shape.props.toNodeId,
    relation: shape.props.relation
  };
}

function isTldrawNodeShape(shape: TldrawCompatShape): shape is TldrawCompatNodeShape {
  return shape.type === zeroflowTlNodeShapeType;
}

function isTldrawEdgeShape(shape: TldrawCompatShape): shape is TldrawCompatEdgeShape {
  return shape.type === zeroflowTlEdgeShapeType;
}

function makeTldrawIndex(index: number) {
  return `a${index.toString().padStart(6, "0")}`;
}

function cloneMetadata(metadata: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(metadata)) as Record<string, unknown>;
}
