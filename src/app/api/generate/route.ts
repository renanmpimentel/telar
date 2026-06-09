import { NextResponse } from "next/server";

import {
  GenerateRequestError,
  handleGenerateRequest,
  ProviderRequestError,
} from "@/lib/ai/generate";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await handleGenerateRequest(body, fetch);
    return NextResponse.json(result);
  } catch (error) {
    const status =
      error instanceof GenerateRequestError || error instanceof ProviderRequestError
        ? error.status
        : 500;
    const message = error instanceof Error ? error.message : "Generation failed";

    return NextResponse.json({ error: { message } }, { status });
  }
}
