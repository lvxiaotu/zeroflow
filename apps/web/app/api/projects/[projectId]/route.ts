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

  return NextResponse.json({ project });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const body = await request.json();
  const project = updateVideoProject(projectId, body);

  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  return NextResponse.json({ project });
}
