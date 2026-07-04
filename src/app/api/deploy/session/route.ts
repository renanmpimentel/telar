import { type NextRequest, NextResponse } from "next/server";

import { TOKEN_COOKIE } from "@/lib/server/deploy";
import type { DeploySession } from "@/lib/deploy/types";

export function GET(request: NextRequest) {
  const session: DeploySession = {
    vercel: Boolean(request.cookies.get(TOKEN_COOKIE.vercel)?.value),
    netlify: Boolean(request.cookies.get(TOKEN_COOKIE.netlify)?.value),
  };
  return NextResponse.json(session);
}
