import fs from "node:fs/promises";
import path from "node:path";
import { getDataDir, getLibraryAsset, getProjectAsset } from "@zeroflow/db";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

const contentTypes: Record<string, string> = {
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".json": "application/json; charset=utf-8"
};

export async function GET(request: NextRequest) {
  const assetId = request.nextUrl.searchParams.get("assetId");

  if (!assetId) {
    return NextResponse.json({ error: "assetId is required" }, { status: 400 });
  }

  const asset = getProjectAsset(assetId) ?? getLibraryAsset(assetId);

  if (!asset?.path) {
    return NextResponse.json({ error: "asset not found" }, { status: 404 });
  }

  const dataDir = path.resolve(getDataDir());
  const assetPath = path.resolve(asset.path);

  if (!isInsideDirectory(assetPath, dataDir)) {
    return NextResponse.json({ error: "asset path is outside data directory" }, { status: 403 });
  }

  try {
    const stat = await fs.stat(assetPath);
    const extension = path.extname(assetPath).toLowerCase();
    const contentType = contentTypes[extension] ?? "application/octet-stream";
    const rangeHeader = request.headers.get("range");

    if (rangeHeader) {
      const range = parseByteRange(rangeHeader, stat.size);

      if (!range) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Accept-Ranges": "bytes",
            "Content-Range": `bytes */${stat.size}`
          }
        });
      }

      const length = range.end - range.start + 1;
      const handle = await fs.open(assetPath, "r");
      const bytes = Buffer.alloc(length);

      try {
        await handle.read(bytes, 0, length, range.start);
      } finally {
        await handle.close();
      }

      return new NextResponse(bytes, {
        status: 206,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
          "Content-Length": String(length),
          "Content-Range": `bytes ${range.start}-${range.end}/${stat.size}`,
          "Content-Type": contentType,
          "X-Zeroflow-Asset-Id": asset.id
        }
      });
    }

    const bytes = await fs.readFile(assetPath);

    return new NextResponse(bytes, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "Content-Length": String(stat.size),
        "Content-Type": contentType,
        "X-Zeroflow-Asset-Id": asset.id
      }
    });
  } catch {
    return NextResponse.json({ error: "asset file not found" }, { status: 404 });
  }
}

function isInsideDirectory(candidatePath: string, directoryPath: string) {
  const relative = path.relative(directoryPath, candidatePath);
  return relative.length === 0 || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function parseByteRange(rangeHeader: string, fileSize: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());

  if (!match) {
    return undefined;
  }

  const [, startValue, endValue] = match;
  let start: number;
  let end: number;

  if (!startValue && !endValue) {
    return undefined;
  }

  if (!startValue) {
    const suffixLength = Number(endValue);

    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      return undefined;
    }

    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    start = Number(startValue);
    end = endValue ? Number(endValue) : fileSize - 1;
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    return undefined;
  }

  return {
    start,
    end: Math.min(end, fileSize - 1)
  };
}
