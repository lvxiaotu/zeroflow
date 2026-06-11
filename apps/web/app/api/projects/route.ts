import { createVideoProject, listVideoProjects } from "@zeroflow/db";
import { NextResponse, type NextRequest } from "next/server";

export async function GET() {
  return NextResponse.json({ projects: listVideoProjects() });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { title?: string; topic?: string };
  const topic = body.topic?.trim();
  const title = body.title?.trim() || topic;

  if (!topic || !title) {
    return NextResponse.json({ error: "title and topic are required" }, { status: 400 });
  }

  return NextResponse.json({ project: createVideoProject({ title, topic }) }, { status: 201 });
}
