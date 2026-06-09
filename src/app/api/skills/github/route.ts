import { NextResponse } from "next/server";

import {
  GithubSkillResolverError,
  resolveGithubGenerationSkill,
} from "@/lib/server/github-skill";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: unknown };
    if (typeof body.url !== "string") {
      throw new GithubSkillResolverError("Enter a valid public GitHub SKILL.md URL.");
    }

    const result = await resolveGithubGenerationSkill(body.url, fetch);
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof GithubSkillResolverError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Could not load generation skill.";

    return NextResponse.json({ error: { message } }, { status });
  }
}
