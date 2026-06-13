import { z } from "zod";
import { idSchema, metadataSchema, positionSchema, sizeSchema } from "./primitives";

export const canvasNodeKindSchema = z.enum([
  "topic",
  "script",
  "structure",
  "storyboard",
  "chapter",
  "scene",
  "caption",
  "voice",
  "chart",
  "chart-highlight",
  "image",
  "d3",
  "three",
  "music",
  "composition",
  "preview",
  "export"
]);

export const canvasNodeStatusSchema = z.enum(["idle", "generating", "ready", "failed"]);

export const canvasNodeSchema = z.object({
  id: idSchema,
  kind: canvasNodeKindSchema,
  refId: idSchema.optional(),
  position: positionSchema,
  size: sizeSchema,
  status: canvasNodeStatusSchema.default("idle"),
  data: metadataSchema.default({})
});

export const canvasEdgeRelationSchema = z.enum(["produces", "uses", "renders", "depends-on"]);

export const canvasEdgeSchema = z.object({
  id: idSchema,
  fromNodeId: idSchema,
  toNodeId: idSchema,
  relation: canvasEdgeRelationSchema
});

export const canvasDocumentSchema = z.object({
  version: z.literal("1"),
  nodes: z.array(canvasNodeSchema),
  edges: z.array(canvasEdgeSchema),
  viewport: z
    .object({
      x: z.number().finite(),
      y: z.number().finite(),
      zoom: z.number().positive()
    })
    .default({ x: 0, y: 0, zoom: 1 })
});

export type CanvasNodeKind = z.infer<typeof canvasNodeKindSchema>;
export type CanvasNodeStatus = z.infer<typeof canvasNodeStatusSchema>;
export type CanvasNode = z.infer<typeof canvasNodeSchema>;
export type CanvasEdgeRelation = z.infer<typeof canvasEdgeRelationSchema>;
export type CanvasEdge = z.infer<typeof canvasEdgeSchema>;
export type CanvasDocument = z.infer<typeof canvasDocumentSchema>;
