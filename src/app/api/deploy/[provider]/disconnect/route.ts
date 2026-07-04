import { type NextRequest, NextResponse } from "next/server";

import { DeployError, TOKEN_COOKIE, parseProvider } from "@/lib/server/deploy";

export function POST(_request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  return handle(context);
}

async function handle(context: { params: Promise<{ provider: string }> }) {
  try {
    const provider = parseProvider((await context.params).provider);
    const response = NextResponse.json({ ok: true });
    response.cookies.delete(TOKEN_COOKIE[provider]);
    return response;
  } catch (error) {
    const code = error instanceof DeployError ? error.code : "generic";
    const status = error instanceof DeployError ? error.status : 500;
    return NextResponse.json({ error: { code } }, { status });
  }
}
