import {
  canvasDocumentToTldrawSnapshot,
  tldrawCompatSnapshotSchema,
  tldrawSnapshotToCanvasDocument
} from "@zeroflow/core";
import { getVideoProject, updateVideoProject } from "@zeroflow/db";
import { NextResponse, type NextRequest } from "next/server";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const project = getVideoProject(projectId);

  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  return NextResponse.json({
    snapshot: canvasDocumentToTldrawSnapshot(project.canvas),
    canvas: project.canvas
  });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const project = getVideoProject(projectId);

  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = tldrawCompatSnapshotSchema.safeParse(body.snapshot ?? body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const canvas = tldrawSnapshotToCanvasDocument(parsed.data, {
    fallbackDocument: project.canvas
  });
  const updated = updateVideoProject(projectId, { canvas });

  if (!updated) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  return NextResponse.json({
    project: updated,
    canvas: updated.canvas,
    spec: updated.spec,
    snapshot: canvasDocumentToTldrawSnapshot(updated.canvas)
  });
}
