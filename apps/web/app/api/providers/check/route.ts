import { getProviderHealth } from "@zeroflow/providers";
import { NextResponse } from "next/server";

export async function GET() {
  const health = getProviderHealth();
  const readiness = Object.fromEntries(health.map((provider) => [provider.id, provider.ready]));

  return NextResponse.json({
    providers: {
      deepseek: Boolean(readiness.deepseek),
      yunwu: Boolean(readiness.yunwu),
      runninghub: Boolean(readiness.runninghub),
      astrochart: Boolean(readiness.astrochart)
    },
    health
  });
}
