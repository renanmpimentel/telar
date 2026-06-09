import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/skills/github/route";

describe("POST /api/skills/github", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a resolved public GitHub generation skill", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response("---\nname: editorial-ui\n---\nUse editorial rhythm.", {
          headers: { "Content-Type": "text/plain" },
          status: 200,
        });
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/skills/github", {
        method: "POST",
        body: JSON.stringify({
          url: "https://github.com/acme/skills/blob/main/editorial/SKILL.md",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      source: "github",
      name: "editorial-ui",
      sourceUrl: "https://raw.githubusercontent.com/acme/skills/main/editorial/SKILL.md",
      content: "---\nname: editorial-ui\n---\nUse editorial rhythm.",
      fetchedAt: expect.any(String),
    });
  });

  it("returns inline-safe errors for invalid skill URLs", async () => {
    const response = await POST(
      new Request("http://localhost/api/skills/github", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com/SKILL.md" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { message: expect.stringContaining("GitHub") },
    });
  });
});
