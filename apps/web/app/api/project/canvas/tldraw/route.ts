import {
  canvasDocumentToTldrawSnapshot,
  tldrawCompatSnapshotSchema,
  tldrawSnapshotToCanvasDocument
} from "@zeroflow/core";
import { getVideoProject, updateVideoProject } from "@zeroflow/db";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const project = getVideoProject(projectId);

  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  return NextResponse.json({
    snapshot: canvasDocumentToTldrawSnapshot(project.canvas),
    canvas: project.canvas
  });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const projectId = request.nextUrl.searchParams.get("projectId") ?? body.projectId;

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const project = getVideoProject(String(projectId));

  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  const parsed = tldrawCompatSnapshotSchema.safeParse(body.snapshot ?? body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const canvas = tldrawSnapshotToCanvasDocument(parsed.data, {
    fallbackDocument: project.canvas
  });
  const updated = updateVideoProject(String(projectId), { canvas });

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
