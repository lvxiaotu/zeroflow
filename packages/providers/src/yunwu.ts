import fs from "node:fs/promises";
import path from "node:path";
import { readEnv } from "./env";
import { createMockImageProvider } from "./mock";
import type { ImageProvider } from "./types";

type ImageResponse = {
  data?: Array<{
    url?: string;
    b64_json?: string;
  }>;
};

export function createYunwuImageProvider(): ImageProvider {
  const apiKey = readEnv("YUNWU_API_KEY");
  const baseUrl = readEnv("YUNWU_BASE_URL") ?? "https://yunwu.ai/v1";
  const defaultModel = normalizeImageModel(readEnv("YUNWU_IMAGE_MODEL"), "gpt-image-2");
  const mock = createMockImageProvider();

  if (!apiKey) {
    return mock;
  }

  return {
    async generateImage(input) {
      const model = normalizeImageModel(input.model, defaultModel);
      const size = input.size ?? "1024x1536";

      try {
        const response = await fetch(`${baseUrl.replace(/\/$/, "")}/images/generations`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            prompt: input.prompt,
            size
          })
        });

        if (!response.ok) {
          return mock.generateImage(input);
        }

        const payload = (await response.json()) as ImageResponse;
        const item = payload.data?.[0];
        if (!item) {
          return mock.generateImage(input);
        }

        let assetPath: string | undefined;

        if (item.b64_json && input.outputPath) {
          await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
          await fs.writeFile(input.outputPath, Buffer.from(item.b64_json, "base64"));
          assetPath = input.outputPath;
        } else if (item.url && input.outputPath) {
          assetPath = await downloadImageAsset(item.url, input.outputPath);
        }

        return {
          provider: "yunwu",
          usedMock: false,
          data: {
            prompt: input.prompt,
            model,
            size,
            assetPath,
            url: item.url,
            b64Json: item.b64_json
          },
          raw: payload
        };
      } catch {
        return mock.generateImage(input);
      }
    }
  };
}

function normalizeImageModel(model: string | undefined, fallback: string) {
  const normalized = model?.trim();

  if (!normalized || !isImageGenerationModel(normalized)) {
    return fallback;
  }

  return normalized;
}

function isImageGenerationModel(model: string) {
  const normalized = model.toLowerCase();

  return (
    normalized.includes("image") ||
    normalized.startsWith("img-") ||
    normalized.startsWith("dall-e")
  );
}

async function downloadImageAsset(url: string, outputPath: string) {
  const response = await fetch(url);

  if (!response.ok) {
    return undefined;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const assetPath = resolveDownloadedImagePath(outputPath, contentType, url);
  const bytes = Buffer.from(await response.arrayBuffer());

  await fs.mkdir(path.dirname(assetPath), { recursive: true });
  await fs.writeFile(assetPath, bytes);

  return assetPath;
}

function resolveDownloadedImagePath(outputPath: string, contentType: string, url: string) {
  const extension = imageExtensionFromContentType(contentType) ?? imageExtensionFromUrl(url);

  if (!extension || path.extname(outputPath).toLowerCase() === extension) {
    return outputPath;
  }

  return path.join(path.dirname(outputPath), `${path.basename(outputPath, path.extname(outputPath))}${extension}`);
}

function imageExtensionFromContentType(contentType: string) {
  if (contentType.includes("image/png")) return ".png";
  if (contentType.includes("image/jpeg")) return ".jpg";
  if (contentType.includes("image/webp")) return ".webp";
  return undefined;
}

function imageExtensionFromUrl(url: string) {
  try {
    const extension = path.extname(new URL(url).pathname).toLowerCase();
    return [".png", ".jpg", ".jpeg", ".webp"].includes(extension) ? extension : undefined;
  } catch {
    return undefined;
  }
}
