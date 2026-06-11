import { deleteVideoProject, getVideoProject, updateVideoProject } from "@zeroflow/db";
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

  return NextResponse.json({ project });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const projectId = request.nextUrl.searchParams.get("projectId") ?? body.projectId;

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const project = updateVideoProject(String(projectId), body);

  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  return NextResponse.json({ project });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const projectId = request.nextUrl.searchParams.get("projectId") ?? body.projectId;

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const deleted = deleteVideoProject(String(projectId));

  if (!deleted) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
