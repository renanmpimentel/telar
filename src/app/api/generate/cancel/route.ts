import { NextResponse } from "next/server";

import { cancelGenerationJob } from "@/lib/ai/generation-jobs";

export async function POST(request: Request) {
  let body: { jobId?: unknown };
  try {
    body = (await request.json()) as { jobId?: unknown };
  } catch {
    body = {};
  }

  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  if (!jobId) {
    return NextResponse.json({ error: { message: "jobId is required" } }, { status: 400 });
  }

  cancelGenerationJob(jobId);
  return NextResponse.json({ ok: true });
}
