import { runJob } from "@/server/jobs/runner";
import { NextResponse, type NextRequest } from "next/server";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function POST(_: NextRequest, context: RouteContext) {
  const { jobId } = await context.params;
  const job = await runJob(jobId);

  if (!job) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }

  return NextResponse.json({ job });
}
