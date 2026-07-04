import { type NextRequest, NextResponse } from "next/server";

import { DeployError, TOKEN_COOKIE, parseProvider, validateToken } from "@/lib/server/deploy";
import type { DeployConnectRequest } from "@/lib/deploy/types";

export function POST(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  return handle(request, context);
}

async function handle(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  try {
    const provider = parseProvider((await context.params).provider);
    const body = (await request.json().catch(() => ({}))) as Partial<DeployConnectRequest>;
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) {
      throw new DeployError("invalid_token", 400);
    }

    await validateToken(provider, token);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(TOKEN_COOKIE[provider], token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
    });
    return response;
  } catch (error) {
    const code = error instanceof DeployError ? error.code : "generic";
    const status = error instanceof DeployError ? error.status : 500;
    return NextResponse.json({ error: { code } }, { status });
  }
}
