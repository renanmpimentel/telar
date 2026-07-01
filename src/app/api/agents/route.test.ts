import { afterEach, describe, expect, it, vi } from "vitest";

describe("GET /api/agents", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("returns available CLI agents", async () => {
    vi.doMock("@/lib/ai/cli-agent", () => ({
      detectCliAgents: async () => ({ claude: true, codex: false }),
    }));
    const { GET } = await import("@/app/api/agents/route");
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ claude: true, codex: false });
  });
});
