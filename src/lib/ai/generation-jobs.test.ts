import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const deferred: { resolve?: (v: unknown) => void; reject?: (e: unknown) => void } = {};
  return {
    deferred,
    handleGenerateRequest: vi.fn(
      () => new Promise((resolve, reject) => {
        deferred.resolve = resolve;
        deferred.reject = reject;
      }),
    ),
  };
});

vi.mock("@/lib/ai/generate", () => ({ handleGenerateRequest: h.handleGenerateRequest }));

import {
  cancelGenerationJob,
  createGenerationJob,
  getGenerationJob,
} from "@/lib/ai/generation-jobs";

const change = { summary: "ok", files: [], notes: [], errors: [] };

describe("generation jobs", () => {
  it("starts running and resolves to done with the change", async () => {
    const id = createGenerationJob({});
    expect(getGenerationJob(id)?.status).toBe("running");

    h.deferred.resolve?.({ change });
    await vi.waitFor(() => expect(getGenerationJob(id)?.status).toBe("done"));
    expect(getGenerationJob(id)?.change).toEqual(change);
  });

  it("reports an error with the thrown message", async () => {
    const id = createGenerationJob({});
    h.deferred.reject?.(new Error("boom"));
    await vi.waitFor(() => expect(getGenerationJob(id)?.status).toBe("error"));
    expect(getGenerationJob(id)?.error).toBe("boom");
  });

  it("cancels a running job and keeps it cancelled even if it later rejects", async () => {
    const id = createGenerationJob({});
    expect(cancelGenerationJob(id)).toBe(true);
    expect(getGenerationJob(id)?.status).toBe("cancelled");

    // The aborted underlying promise rejecting must not overwrite "cancelled".
    h.deferred.reject?.(new Error("AbortError"));
    await Promise.resolve();
    expect(getGenerationJob(id)?.status).toBe("cancelled");
  });

  it("returns undefined / false for unknown jobs", () => {
    expect(getGenerationJob("nope")).toBeUndefined();
    expect(cancelGenerationJob("nope")).toBe(false);
  });
});
