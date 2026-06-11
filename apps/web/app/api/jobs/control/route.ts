import { cancelJob, retryJob } from "@zeroflow/db";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const jobId = request.nextUrl.searchParams.get("jobId") ?? body.jobId;
  const action = request.nextUrl.searchParams.get("action") ?? body.action;

  if (!jobId || !action) {
    return NextResponse.json({ error: "jobId and action are required" }, { status: 400 });
  }

  const job =
    action === "retry"
      ? retryJob(String(jobId))
      : action === "cancel"
        ? cancelJob(String(jobId))
        : null;

  if (!job) {
    return NextResponse.json({ error: "job not found or action is invalid" }, { status: 404 });
  }

  return NextResponse.json({ job });
}
