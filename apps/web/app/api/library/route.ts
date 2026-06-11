import { createLibraryAsset, listLibraryAssets } from "@zeroflow/db";
import { NextResponse, type NextRequest } from "next/server";

export async function GET() {
  return NextResponse.json({ assets: listLibraryAssets() });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const asset = createLibraryAsset({
    name: String(body.name ?? "未命名资源"),
    kind: body.kind ?? "illustration",
    status: body.status ?? "ready",
    path: body.path,
    tags: Array.isArray(body.tags) ? body.tags : [],
    metadata: typeof body.metadata === "object" && body.metadata ? body.metadata : {}
  });

  return NextResponse.json({ asset }, { status: 201 });
}
