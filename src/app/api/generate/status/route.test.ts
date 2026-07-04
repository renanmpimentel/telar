import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const store = vi.hoisted(() => ({ getGenerationJob: vi.fn() }));
vi.mock("@/lib/ai/generation-jobs", () => ({ getGenerationJob: store.getGenerationJob }));

import { GET } from "@/app/api/generate/status/route";

function statusRequest(jobId?: string) {
  const url = jobId
    ? `http://localhost/api/generate/status?jobId=${jobId}`
    : "http://localhost/api/generate/status";
  return new NextRequest(url);
}

describe("GET /api/generate/status", () => {
  afterEach(() => vi.clearAllMocks());

  it("requires a jobId", async () => {
    const response = GET(statusRequest());
    expect(response.status).toBe(400);
  });

  it("returns 404 for an unknown job", async () => {
    store.getGenerationJob.mockReturnValue(undefined);
    const response = GET(statusRequest("gone"));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ status: "unknown" });
  });

  it("returns the change when done", async () => {
    const change = { summary: "ok", files: [], notes: [], errors: [] };
    store.getGenerationJob.mockReturnValue({ status: "done", change });
    const response = GET(statusRequest("j1"));
    await expect(response.json()).resolves.toEqual({ status: "done", change });
  });

  it("wraps the error message when failed", async () => {
    store.getGenerationJob.mockReturnValue({ status: "error", error: "boom" });
    const response = GET(statusRequest("j2"));
    await expect(response.json()).resolves.toEqual({
      status: "error",
      error: { message: "boom" },
    });
  });

  it("reports a running job", async () => {
    store.getGenerationJob.mockReturnValue({ status: "running" });
    const response = GET(statusRequest("j3"));
    await expect(response.json()).resolves.toEqual({ status: "running" });
  });
});
