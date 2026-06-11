import { jobTypeSchema } from "@zeroflow/core";
import { createJob, listJobs } from "@zeroflow/db";
import { NextResponse, type NextRequest } from "next/server";
import { jobNeedsLiveProviderConfirmation } from "@/server/jobs/providerGuard";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId") ?? undefined;
  return NextResponse.json({ jobs: listJobs(projectId) });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!body.projectId || !body.type) {
    return NextResponse.json({ error: "projectId and type are required" }, { status: 400 });
  }

  const parsedType = jobTypeSchema.safeParse(body.type);

  if (!parsedType.success) {
    return NextResponse.json({ error: "job type is invalid" }, { status: 400 });
  }

  const input =
    body.input && typeof body.input === "object" && !Array.isArray(body.input) ? body.input : {};
  const liveProviderRisk = jobNeedsLiveProviderConfirmation(parsedType.data, input);

  if (liveProviderRisk) {
    return NextResponse.json(
      {
        error: "live provider confirmation required",
        confirmationRequired: true,
        providerRisk: liveProviderRisk
      },
      { status: 409 }
    );
  }

  const job = createJob({
    projectId: String(body.projectId),
    type: parsedType.data,
    canvasNodeId: body.canvasNodeId,
    input,
    maxAttempts: body.maxAttempts
  });

  return NextResponse.json({ job }, { status: 201 });
}
