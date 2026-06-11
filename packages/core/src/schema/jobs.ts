import { z } from "zod";
import { idSchema, isoDateSchema, metadataSchema } from "./primitives";

export const jobTypeSchema = z.enum([
  "generate-script",
  "generate-storyboard",
  "resolve-assets",
  "generate-chart",
  "generate-image",
  "generate-tts",
  "align-captions",
  "create-d3-node",
  "create-three-node",
  "create-composition-node",
  "create-preview-node",
  "create-export-node",
  "export-visual-asset",
  "render-preview",
  "render-video",
  "promote-asset-to-library"
]);

export const jobStatusSchema = z.enum(["pending", "running", "succeeded", "failed", "cancelled"]);

export const jobErrorSchema = z.object({
  type: z.enum(["user-fixable", "retryable", "fatal"]),
  message: z.string().min(1),
  details: metadataSchema.optional(),
  retryable: z.boolean().default(false)
});

export const jobSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  canvasNodeId: idSchema.optional(),
  type: jobTypeSchema,
  status: jobStatusSchema,
  input: metadataSchema.default({}),
  output: metadataSchema.optional(),
  error: jobErrorSchema.optional(),
  attempts: z.number().int().min(0).default(0),
  maxAttempts: z.number().int().min(1).default(3),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema
});

export type JobType = z.infer<typeof jobTypeSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type JobError = z.infer<typeof jobErrorSchema>;
export type Job = z.infer<typeof jobSchema>;
