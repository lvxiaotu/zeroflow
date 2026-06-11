import { z } from "zod";
import { projectAssetRefSchema } from "./assets";
import { canvasDocumentSchema } from "./canvas";
import { audioSpecSchema, sceneSchema } from "./scenes";
import { idSchema, isoDateSchema } from "./primitives";

export const videoFormatSchema = z.enum(["portrait", "landscape", "square"]);

export const videoProjectStatusSchema = z.enum(["draft", "generating", "ready", "exported"]);

export const astroVideoSpecSchema = z.object({
  version: z.literal("1"),
  title: z.string().min(1),
  format: videoFormatSchema,
  fps: z.number().int().positive(),
  stylePresetId: idSchema.optional(),
  templateId: idSchema.optional(),
  scenes: z.array(sceneSchema),
  audio: audioSpecSchema.optional()
});

export const videoProjectSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  topic: z.string().min(1),
  status: videoProjectStatusSchema,
  spec: astroVideoSpecSchema,
  canvas: canvasDocumentSchema,
  assetRefs: z.array(projectAssetRefSchema).default([]),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema
});

export type VideoFormat = z.infer<typeof videoFormatSchema>;
export type VideoProjectStatus = z.infer<typeof videoProjectStatusSchema>;
export type AstroVideoSpec = z.infer<typeof astroVideoSpecSchema>;
export type VideoProject = z.infer<typeof videoProjectSchema>;
