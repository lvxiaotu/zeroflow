import { jobTypeSchema } from "@zeroflow/core";
import { createJob, listJobs } from "@zeroflow/db";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId") ?? undefined;
  return NextResponse.json({ jobs: listJobs(projectId) });
}

export async function POST(request: NextRequest) {
  const body = await readRequestJson(request);

  if (body === null) {
    return NextResponse.json({ error: "request aborted" }, { status: 499 });
  }

  if (!body.projectId || !body.type) {
    return NextResponse.json({ error: "projectId and type are required" }, { status: 400 });
  }

  const parsedType = jobTypeSchema.safeParse(body.type);

  if (!parsedType.success) {
    return NextResponse.json({ error: "job type is invalid" }, { status: 400 });
  }

  const input =
    body.input && typeof body.input === "object" && !Array.isArray(body.input)
      ? (body.input as Record<string, unknown>)
      : {};
  const canvasNodeId = typeof body.canvasNodeId === "string" ? body.canvasNodeId : undefined;
  const maxAttempts = typeof body.maxAttempts === "number" ? body.maxAttempts : undefined;

  const job = createJob({
    projectId: String(body.projectId),
    type: parsedType.data,
    canvasNodeId,
    input,
    maxAttempts
  });

  return NextResponse.json({ job }, { status: 201 });
}

async function readRequestJson(request: NextRequest) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch (error) {
    if (isAbortError(error)) {
      return null;
    }

    return {};
  }
}

function isAbortError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}
