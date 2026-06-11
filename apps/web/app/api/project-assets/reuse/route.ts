import {
  addProjectAssetRef,
  getLibraryAsset,
  getVideoProject,
  updateVideoProject
} from "@zeroflow/db";
import type { AssetUsage, CanvasDocument, CanvasNodeKind, LibraryAssetKind } from "@zeroflow/core";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    libraryAssetId?: string;
    canvasNodeId?: string;
  };
  const projectId = body.projectId?.trim();
  const libraryAssetId = body.libraryAssetId?.trim();

  if (!projectId || !libraryAssetId) {
    return NextResponse.json(
      { error: "projectId and libraryAssetId are required" },
      { status: 400 }
    );
  }

  const project = getVideoProject(projectId);
  const asset = getLibraryAsset(libraryAssetId);

  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  if (!asset) {
    return NextResponse.json({ error: "library asset not found" }, { status: 404 });
  }

  const targetNodeId = body.canvasNodeId?.trim() || findTargetNodeId(project.canvas, asset.kind);
  const assetUrl = asset.path
    ? `/api/project-asset?assetId=${encodeURIComponent(asset.id)}`
    : undefined;
  const usage = usageFromKind(asset.kind);
  const canvas = targetNodeId
    ? attachLibraryAssetToNode(project.canvas, targetNodeId, asset, assetUrl)
    : project.canvas;

  updateVideoProject(project.id, { canvas });
  const ref = addProjectAssetRef(project.id, {
    assetId: asset.id,
    assetScope: "library",
    usage,
    canvasNodeId: targetNodeId
  });

  return NextResponse.json({
    asset,
    assetRef: ref,
    targetNodeId,
    project: getVideoProject(project.id)
  });
}

function attachLibraryAssetToNode(
  canvas: CanvasDocument,
  nodeId: string,
  asset: ReturnType<typeof getLibraryAsset> extends infer T ? NonNullable<T> : never,
  assetUrl: string | undefined
): CanvasDocument {
  return {
    ...canvas,
    nodes: canvas.nodes.map((node) =>
      node.id === nodeId
        ? {
            ...node,
            status: "ready" as const,
            refId: asset.id,
            data: {
              ...node.data,
              refId: asset.id,
              assetId: asset.id,
              assetScope: "library",
              assetPath: asset.path,
              assetUrl,
              provider: stringMetadata(asset.metadata.provider),
              source: "library-reuse",
              libraryAssetId: asset.id,
              libraryAssetName: asset.name,
              libraryAssetKind: asset.kind
            }
          }
        : node
    )
  };
}

function findTargetNodeId(canvas: CanvasDocument, kind: LibraryAssetKind) {
  const targetKind = nodeKindFromAssetKind(kind);
  return canvas.nodes.find((node) => node.kind === targetKind)?.id;
}

function nodeKindFromAssetKind(kind: LibraryAssetKind): CanvasNodeKind {
  if (kind === "audio" || kind === "voice-profile") {
    return "voice";
  }

  if (kind === "bgm") {
    return "music";
  }

  if (kind === "subtitle") {
    return "caption";
  }

  if (kind === "chart-style" || kind === "planet-symbol" || kind === "zodiac-symbol") {
    return "chart";
  }

  if (kind === "scene-template" || kind === "intro" || kind === "outro") {
    return "scene";
  }

  return "image";
}

function usageFromKind(kind: LibraryAssetKind): AssetUsage {
  if (kind === "audio") {
    return "narration";
  }

  if (kind === "voice-profile") {
    return "voice";
  }

  if (kind === "bgm") {
    return "background";
  }

  if (kind === "subtitle") {
    return "subtitle";
  }

  if (kind === "chart-style" || kind === "planet-symbol" || kind === "zodiac-symbol") {
    return "chart";
  }

  if (kind === "intro") {
    return "intro";
  }

  if (kind === "outro") {
    return "outro";
  }

  return "scene";
}

function stringMetadata(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
