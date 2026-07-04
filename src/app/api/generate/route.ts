import { NextResponse } from "next/server";

import { createGenerationJob } from "@/lib/ai/generation-jobs";

// Starts a background generation and returns its id immediately. The client
// polls /api/generate/status and can stop it via /api/generate/cancel, so a slow
// prompt is no longer bound to the lifetime of this request.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid request body" } }, { status: 400 });
  }

  const jobId = createGenerationJob(body);
  return NextResponse.json({ jobId });
}
