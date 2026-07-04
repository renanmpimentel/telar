import { type NextRequest, NextResponse } from "next/server";

import { getGenerationJob } from "@/lib/ai/generation-jobs";

export function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: { message: "jobId is required" } }, { status: 400 });
  }

  const job = getGenerationJob(jobId);
  if (!job) {
    // The job is gone (server restarted, or it aged out) — the client treats
    // this as "generation lost" and lets the user retry.
    return NextResponse.json({ status: "unknown" }, { status: 404 });
  }

  if (job.status === "done") {
    return NextResponse.json({ status: "done", change: job.change });
  }
  if (job.status === "error") {
    return NextResponse.json({
      status: "error",
      error: { message: job.error ?? "Falha na geração." },
    });
  }

  // running | cancelled
  return NextResponse.json({ status: job.status });
}
