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
  const defaultModel = readEnv("YUNWU_IMAGE_MODEL") ?? "gpt-image-2";
  const mock = createMockImageProvider();

  if (!apiKey) {
    return mock;
  }

  return {
    async generateImage(input) {
      try {
        const response = await fetch(`${baseUrl.replace(/\/$/, "")}/images/generations`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: input.model ?? defaultModel,
            prompt: input.prompt,
            size: input.size ?? "1024x1536"
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

        if (item.b64_json && input.outputPath) {
          await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
          await fs.writeFile(input.outputPath, Buffer.from(item.b64_json, "base64"));
        }

        return {
          provider: "yunwu",
          usedMock: false,
          data: {
            prompt: input.prompt,
            assetPath: item.b64_json ? input.outputPath : undefined,
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
