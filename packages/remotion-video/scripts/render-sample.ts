import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroVideoSpec } from "@zeroflow/core";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition, type FrameRange } from "@remotion/renderer";
import { REMOTION_COMP_ID, samplePreviewSpec } from "../src";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(packageRoot, "../..");
const entryPoint = path.join(packageRoot, "src", "remotion-entry.tsx");
const outputDir = path.join(workspaceRoot, "data", "exports");
const stillOutput = path.join(outputDir, "p3-still.png");
const videoOutput = path.join(outputDir, "p3-preview.mp4");
const chromeExecutable = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const args = new Set(process.argv.slice(2));
const renderStillOnly = args.has("--still");
const renderVideoOnly = args.has("--video");
const muted = args.has("--muted");
const shouldRenderStill = renderStillOnly || (!renderStillOnly && !renderVideoOnly);
const shouldRenderVideo = renderVideoOnly || (!renderStillOnly && !renderVideoOnly);
const specPath = readArg("--spec");
const outputPath = readArg("--output");
const assetOrigin = normalizeAssetOrigin(readArg("--asset-origin") ?? process.env.ZEROFLOW_ASSET_ORIGIN);
const stillFrame = Number(readArg("--frame") ?? 30);
const frameRange = parseFrameRange(readArg("--frame-range"));
const inputSpec = await readInputSpec(specPath);
const inputProps = { spec: withResolvedAssetUrls(inputSpec, assetOrigin) };
const resolvedStillOutput =
  outputPath && shouldRenderStill && !shouldRenderVideo ? path.resolve(outputPath) : stillOutput;
const resolvedVideoOutput =
  outputPath && shouldRenderVideo && !shouldRenderStill ? path.resolve(outputPath) : videoOutput;
let lastLoggedProgress = -10;

await fs.mkdir(outputDir, { recursive: true });
if (outputPath) {
  await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
}

console.log("Bundling Remotion composition...");
const serveUrl = await bundle({
  entryPoint,
  onProgress: (progress) => {
    if (progress === 1) {
      console.log("Bundle complete.");
    }
  },
  rootDir: packageRoot,
  publicDir: null
});

console.log(`Selecting composition ${REMOTION_COMP_ID}...`);
const composition = await selectComposition({
  serveUrl,
  id: REMOTION_COMP_ID,
  inputProps,
  browserExecutable: chromeExecutable,
  logLevel: "warn",
  timeoutInMilliseconds: 120000
});

if (shouldRenderStill) {
  console.log(`Rendering still frame -> ${resolvedStillOutput}`);
  await renderStill({
    serveUrl,
    composition,
    inputProps,
    output: resolvedStillOutput,
    frame: Number.isFinite(stillFrame) ? stillFrame : 30,
    imageFormat: "png",
    scale: 0.25,
    overwrite: true,
    browserExecutable: chromeExecutable,
    logLevel: "warn",
    timeoutInMilliseconds: 120000
  });
}

if (shouldRenderVideo) {
  console.log(`Rendering MP4 -> ${resolvedVideoOutput}`);
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    outputLocation: resolvedVideoOutput,
    codec: "h264",
    scale: 0.25,
    muted,
    overwrite: true,
    browserExecutable: chromeExecutable,
    concurrency: 1,
    frameRange,
    logLevel: "warn",
    timeoutInMilliseconds: 120000,
    onProgress: ({ progress }) => {
      const percent = Math.floor(progress * 10) * 10;

      if (percent > lastLoggedProgress) {
        lastLoggedProgress = percent;
        console.log(`Render progress: ${percent}%`);
      }
    }
  });
}

console.log("Remotion sample render complete.");

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

async function readInputSpec(specPath: string | undefined): Promise<AstroVideoSpec> {
  if (!specPath) {
    return samplePreviewSpec;
  }

  const raw = await fs.readFile(path.resolve(specPath), "utf8");
  return JSON.parse(raw) as AstroVideoSpec;
}

function normalizeAssetOrigin(origin: string | undefined) {
  if (!origin) {
    return undefined;
  }

  return new URL(origin).origin;
}

function parseFrameRange(value: string | undefined): FrameRange | null {
  if (!value) {
    return null;
  }

  const [startText, endText] = value.split(":");
  const start = Number(startText);
  const end = Number(endText);

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
    throw new Error(`Invalid --frame-range value: ${value}`);
  }

  return [start, end];
}

function withResolvedAssetUrls<T>(value: T, assetOrigin: string | undefined): T {
  if (!assetOrigin) {
    return value;
  }

  if (typeof value === "string") {
    return (value.startsWith("/") && !value.startsWith("//")
      ? new URL(value, assetOrigin).toString()
      : value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => withResolvedAssetUrls(item, assetOrigin)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, withResolvedAssetUrls(item, assetOrigin)])
    ) as T;
  }

  return value;
}
