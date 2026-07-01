import { NextResponse } from "next/server";

import { detectCliAgents } from "@/lib/ai/cli-agent";

export async function GET() {
  const agents = await detectCliAgents();
  return NextResponse.json(agents);
}
