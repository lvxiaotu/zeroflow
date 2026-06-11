import { z } from "zod";
import { assetScopeSchema } from "./assets";
import { colorSchema, idSchema } from "./primitives";

export const transitionSchema = z.enum(["cut", "fade", "wipe", "zoom"]);
export const sceneLayoutPresetSchema = z.enum(["single", "split", "overlay"]);

export const captionAnimationSchema = z.enum(["none", "fade", "rise", "typewriter"]);

export const captionCueSchema = z.object({
  id: idSchema.optional(),
  text: z.string().min(1),
  startSec: z.number().min(0).default(0),
  durationSec: z.number().positive()
});

export const captionLayoutSchema = z.object({
  text: z.string().min(1).optional(),
  assetId: idSchema.optional(),
  assetScope: assetScopeSchema.optional(),
  assetUrl: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  cues: z.array(captionCueSchema).default([]),
  yPercent: z.number().min(0).max(100).default(78),
  fontSize: z.number().positive().default(48),
  color: colorSchema.default("#ffffff"),
  backgroundColor: colorSchema.optional(),
  animation: captionAnimationSchema.default("fade")
});

export const voiceSettingsSchema = z.object({
  voiceProfileAssetId: idSchema.optional(),
  speed: z.number().positive().default(1),
  volume: z.number().min(0).max(2).default(1),
  emotion: z.string().min(1).optional()
});

export const baseSceneSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  narration: z.string().min(1),
  durationSec: z.number().positive(),
  transition: transitionSchema.optional(),
  layoutPreset: sceneLayoutPresetSchema.optional(),
  caption: captionLayoutSchema.optional(),
  voice: voiceSettingsSchema.optional()
});

export const textSceneSchema = baseSceneSchema.extend({
  type: z.literal("text"),
  headline: z.string().min(1),
  body: z.string().optional()
});

export const astroChartHighlightSchema = z.object({
  kind: z.enum(["planet", "house", "aspect", "zodiac"]),
  id: idSchema,
  label: z.string().min(1)
});

export const astroChartSceneSchema = baseSceneSchema.extend({
  type: z.literal("astro-chart"),
  chartId: idSchema,
  chartAssetId: idSchema.optional(),
  chartAssetUrl: z.string().min(1).optional(),
  chartSource: z.string().min(1).optional(),
  highlights: z.array(astroChartHighlightSchema).default([])
});

export const sketchSceneSchema = baseSceneSchema.extend({
  type: z.literal("sketch"),
  prompt: z.string().min(1),
  assetId: idSchema.optional(),
  assetUrl: z.string().min(1).optional(),
  assetSource: z.string().min(1).optional()
});

export const d3DiagramSceneSchema = baseSceneSchema.extend({
  type: z.literal("d3-diagram"),
  diagram: z.enum(["timeline", "relationship", "tree", "distribution"]),
  data: z.unknown(),
  renderMode: z.enum(["contract", "asset"]).default("contract"),
  assetId: idSchema.optional(),
  assetUrl: z.string().min(1).optional(),
  assetSource: z.string().min(1).optional()
});

export const threeSceneSchema = baseSceneSchema.extend({
  type: z.literal("three-scene"),
  scene: z.enum(["orbit", "zodiac-space", "planet-focus"]),
  data: z.unknown(),
  renderMode: z.enum(["contract", "asset"]).default("contract"),
  assetId: idSchema.optional(),
  assetUrl: z.string().min(1).optional(),
  assetSource: z.string().min(1).optional()
});

export const sceneSchema = z.discriminatedUnion("type", [
  textSceneSchema,
  astroChartSceneSchema,
  sketchSceneSchema,
  d3DiagramSceneSchema,
  threeSceneSchema
]);

export const audioTrackSchema = z.object({
  id: idSchema,
  assetId: idSchema,
  assetScope: assetScopeSchema,
  assetUrl: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  kind: z.enum(["narration", "music", "sfx"]),
  startSec: z.number().min(0).default(0),
  durationSec: z.number().positive().optional(),
  volume: z.number().min(0).max(2).default(1),
  playbackRate: z.number().positive().optional()
});

export const audioSpecSchema = z.object({
  tracks: z.array(audioTrackSchema).default([])
});

export type Transition = z.infer<typeof transitionSchema>;
export type SceneLayoutPreset = z.infer<typeof sceneLayoutPresetSchema>;
export type CaptionAnimation = z.infer<typeof captionAnimationSchema>;
export type CaptionCue = z.infer<typeof captionCueSchema>;
export type CaptionLayout = z.infer<typeof captionLayoutSchema>;
export type VoiceSettings = z.infer<typeof voiceSettingsSchema>;
export type BaseScene = z.infer<typeof baseSceneSchema>;
export type TextSceneSpec = z.infer<typeof textSceneSchema>;
export type AstroChartHighlight = z.infer<typeof astroChartHighlightSchema>;
export type AstroChartSceneSpec = z.infer<typeof astroChartSceneSchema>;
export type SketchSceneSpec = z.infer<typeof sketchSceneSchema>;
export type D3DiagramSceneSpec = z.infer<typeof d3DiagramSceneSchema>;
export type ThreeSceneSpec = z.infer<typeof threeSceneSchema>;
export type VisualRenderMode = D3DiagramSceneSpec["renderMode"];
export type SceneSpec = z.infer<typeof sceneSchema>;
export type AudioTrack = z.infer<typeof audioTrackSchema>;
export type AudioSpec = z.infer<typeof audioSpecSchema>;
