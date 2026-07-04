import { type NextRequest, NextResponse } from "next/server";

import {
  DeployError,
  TOKEN_COOKIE,
  deployToNetlify,
  deployToVercel,
  parseProvider,
} from "@/lib/server/deploy";
import type { VercelDeployRequest } from "@/lib/deploy/types";

export function POST(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  return handle(request, context);
}

async function handle(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  try {
    const provider = parseProvider((await context.params).provider);
    const token = request.cookies.get(TOKEN_COOKIE[provider])?.value;
    if (!token) {
      throw new DeployError("not_connected", 401);
    }

    if (provider === "vercel") {
      const body = (await request.json()) as VercelDeployRequest;
      if (!body || typeof body.name !== "string" || typeof body.files !== "object") {
        throw new DeployError("invalid_payload", 400);
      }
      const result = await deployToVercel(token, body.name, body.files, body.binaryFiles ?? []);
      return NextResponse.json(result);
    }

    // Netlify: the raw request body is a zip of the pre-built static site.
    const zip = await request.arrayBuffer();
    if (zip.byteLength === 0) {
      throw new DeployError("empty_build", 400);
    }
    const siteId = request.nextUrl.searchParams.get("siteId") || undefined;
    const name = request.nextUrl.searchParams.get("name") || undefined;
    const result = await deployToNetlify(token, zip, { siteId, name });
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof DeployError ? error.code : "generic";
    const status = error instanceof DeployError ? error.status : 500;
    return NextResponse.json({ error: { code } }, { status });
  }
}
