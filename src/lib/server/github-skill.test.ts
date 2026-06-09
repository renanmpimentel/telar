import { describe, expect, it, vi } from "vitest";

import {
  MAX_GENERATION_SKILL_CONTENT_BYTES,
  resolveGithubGenerationSkill,
} from "@/lib/server/github-skill";

describe("resolveGithubGenerationSkill", () => {
  it("normalizes GitHub blob URLs to raw SKILL.md URLs", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response("---\nname: cinematic-ui\n---\nBuild with strong visual direction.", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        status: 200,
      });
    });

    const resolved = await resolveGithubGenerationSkill(
      "https://github.com/acme/skills/blob/main/cinematic/SKILL.md",
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/acme/skills/main/cinematic/SKILL.md",
      expect.objectContaining({
        headers: expect.not.objectContaining({ Authorization: expect.any(String) }),
      }),
    );
    expect(resolved).toEqual({
      source: "github",
      name: "cinematic-ui",
      sourceUrl: "https://raw.githubusercontent.com/acme/skills/main/cinematic/SKILL.md",
      content: "---\nname: cinematic-ui\n---\nBuild with strong visual direction.",
      fetchedAt: expect.any(String),
    });
  });

  it("accepts raw.githubusercontent.com SKILL.md URLs", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response("# Skill\nUse a calm interface.", {
        headers: { "Content-Type": "text/markdown" },
        status: 200,
      });
    });

    const resolved = await resolveGithubGenerationSkill(
      "https://raw.githubusercontent.com/acme/skills/main/SKILL.md",
      fetchImpl,
    );

    expect(resolved.sourceUrl).toBe("https://raw.githubusercontent.com/acme/skills/main/SKILL.md");
    expect(resolved.name).toBe("SKILL.md");
  });

  it("rejects non-GitHub hosts", async () => {
    await expect(
      resolveGithubGenerationSkill("https://example.com/acme/skills/main/SKILL.md", vi.fn()),
    ).rejects.toThrow(/GitHub/);
  });

  it("rejects URLs that do not point to SKILL.md", async () => {
    await expect(
      resolveGithubGenerationSkill("https://github.com/acme/skills/blob/main/README.md", vi.fn()),
    ).rejects.toThrow(/SKILL\.md/);
  });

  it("rejects inaccessible files", async () => {
    const fetchImpl = vi.fn(async () => new Response("not found", { status: 404 }));

    await expect(
      resolveGithubGenerationSkill("https://raw.githubusercontent.com/acme/skills/main/SKILL.md", fetchImpl),
    ).rejects.toThrow(/inaccessible/);
  });

  it("rejects non-text responses", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    });

    await expect(
      resolveGithubGenerationSkill("https://raw.githubusercontent.com/acme/skills/main/SKILL.md", fetchImpl),
    ).rejects.toThrow(/text/);
  });

  it("rejects content above 100KB", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response("x".repeat(MAX_GENERATION_SKILL_CONTENT_BYTES + 1), {
        headers: { "Content-Type": "text/plain" },
        status: 200,
      });
    });

    await expect(
      resolveGithubGenerationSkill("https://raw.githubusercontent.com/acme/skills/main/SKILL.md", fetchImpl),
    ).rejects.toThrow(/100KB/);
  });
});
