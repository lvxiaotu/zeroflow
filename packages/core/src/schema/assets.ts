import { z } from "zod";
import { idSchema, isoDateSchema, metadataSchema } from "./primitives";

export const assetScopeSchema = z.enum(["project", "library"]);

export const assetStatusSchema = z.enum(["pending", "generating", "ready", "failed"]);

export const libraryAssetKindSchema = z.enum([
  "zodiac-symbol",
  "planet-symbol",
  "chart-style",
  "intro",
  "outro",
  "bgm",
  "voice-profile",
  "scene-template",
  "illustration",
  "svg",
  "image",
  "audio",
  "subtitle",
  "video"
]);

export const assetUsageSchema = z.enum([
  "intro",
  "outro",
  "scene",
  "narration",
  "chart",
  "background",
  "sfx",
  "subtitle",
  "voice",
  "export"
]);

export const licenseInfoSchema = z.object({
  label: z.string().min(1),
  url: z.string().url().optional(),
  notes: z.string().optional()
});

export const libraryAssetSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  kind: libraryAssetKindSchema,
  status: assetStatusSchema,
  path: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).default([]),
  reusable: z.boolean().default(true),
  license: licenseInfoSchema.optional(),
  metadata: metadataSchema.default({}),
  usageCount: z.number().int().min(0).default(0),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema
});

export const projectAssetRefSchema = z.object({
  assetId: idSchema,
  assetScope: assetScopeSchema,
  usage: assetUsageSchema,
  sceneId: idSchema.optional(),
  canvasNodeId: idSchema.optional()
});

export type AssetScope = z.infer<typeof assetScopeSchema>;
export type AssetStatus = z.infer<typeof assetStatusSchema>;
export type LibraryAssetKind = z.infer<typeof libraryAssetKindSchema>;
export type AssetUsage = z.infer<typeof assetUsageSchema>;
export type LicenseInfo = z.infer<typeof licenseInfoSchema>;
export type LibraryAsset = z.infer<typeof libraryAssetSchema>;
export type ProjectAssetRef = z.infer<typeof projectAssetRefSchema>;
