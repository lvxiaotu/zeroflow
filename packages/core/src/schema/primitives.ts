import { z } from "zod";

export const idSchema = z.string().min(1);
export const isoDateSchema = z.string().datetime();
export const metadataSchema = z.record(z.unknown());

export const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite()
});

export const sizeSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive()
});

export const colorSchema = z.string().min(1);
