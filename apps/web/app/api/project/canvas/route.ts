import { canvasDocumentSchema } from "@zeroflow/core";
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

  return NextResponse.json({ canvas: project.canvas, spec: project.spec });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const projectId = request.nextUrl.searchParams.get("projectId") ?? body.projectId;
  const parsed = canvasDocumentSchema.safeParse(body.canvas ?? body);

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const project = updateVideoProject(String(projectId), { canvas: parsed.data });

  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  return NextResponse.json({ project });
}
