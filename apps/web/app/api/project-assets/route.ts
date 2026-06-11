import { listLibraryAssets, listProjectAssets } from "@zeroflow/db";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const libraryAssets = listLibraryAssets();
  const assets = listProjectAssets(projectId).map((asset) => {
    const promoted = libraryAssets.find(
      (libraryAsset) => libraryAsset.metadata.sourceProjectAssetId === asset.id
    );

    return {
      ...asset,
      promotedLibraryAssetId: promoted?.id
    };
  });

  return NextResponse.json({ assets });
}
