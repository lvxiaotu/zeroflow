import { canvasDocumentSchema } from "@zeroflow/core";
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

  return NextResponse.json({ canvas: project.canvas, spec: project.spec });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const parsed = canvasDocumentSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const project = updateVideoProject(projectId, { canvas: parsed.data });

  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  return NextResponse.json({ project });
}
