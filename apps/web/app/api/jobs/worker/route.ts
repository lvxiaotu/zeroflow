import { runPendingJobs } from "@/server/jobs/runner";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const projectId = request.nextUrl.searchParams.get("projectId") ?? body.projectId;
  const rawLimit = request.nextUrl.searchParams.get("limit") ?? body.limit;
  const limit = typeof rawLimit === "number" ? rawLimit : Number(rawLimit ?? 5);
  const result = await runPendingJobs({
    projectId: projectId ? String(projectId) : undefined,
    limit: Number.isFinite(limit) ? limit : 5
  });

  return NextResponse.json(result);
}
