import { afterEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ cancelGenerationJob: vi.fn() }));
vi.mock("@/lib/ai/generation-jobs", () => ({ cancelGenerationJob: store.cancelGenerationJob }));

import { POST } from "@/app/api/generate/cancel/route";

function cancelRequest(body: unknown) {
  return new Request("http://localhost/api/generate/cancel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/generate/cancel", () => {
  afterEach(() => vi.clearAllMocks());

  it("cancels the given job", async () => {
    const response = await POST(cancelRequest({ jobId: "j1" }));
    expect(response.status).toBe(200);
    expect(store.cancelGenerationJob).toHaveBeenCalledWith("j1");
  });

  it("requires a jobId", async () => {
    const response = await POST(cancelRequest({}));
    expect(response.status).toBe(400);
    expect(store.cancelGenerationJob).not.toHaveBeenCalled();
  });
});
