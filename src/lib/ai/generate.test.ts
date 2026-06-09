import { describe, expect, it, vi } from "vitest";

import { handleGenerateRequest } from "@/lib/ai/generate";
import { createDefaultProjectFiles } from "@/lib/project/template";

const request = {
  provider: "openai" as const,
  apiKey: "test-key",
  model: "gpt-5-mini",
  prompt: "Make a notes app",
  messages: [],
  files: createDefaultProjectFiles(),
};

describe("handleGenerateRequest", () => {
  it("calls OpenAI with structured output and returns a validated change", async () => {
    const change = {
      summary: "Built notes app",
      files: [{ path: "src/App.tsx", content: "export default function App() { return <main>Notes</main>; }" }],
      notes: [],
      errors: [],
    };
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ output_text: JSON.stringify(change) }), { status: 200 }),
    );

    const response = await handleGenerateRequest(request, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
      }),
    );
    expect(response.change.summary).toBe("Built notes app");
  });

  it("calls Anthropic with a strict tool schema and returns tool input", async () => {
    const change = {
      summary: "Built board",
      files: [{ path: "src/App.tsx", content: "export default function App() { return <main>Board</main>; }" }],
      notes: [],
      errors: [],
    };
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          content: [{ type: "tool_use", name: "propose_files", input: change }],
        }),
        { status: 200 },
      ),
    );

    const response = await handleGenerateRequest(
      { ...request, provider: "anthropic", model: "claude-sonnet-4-5" },
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-api-key": "test-key" }),
      }),
    );
    expect(response.change.summary).toBe("Built board");
  });

  it("rejects invalid provider output", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            summary: "Unsafe",
            files: [{ path: "../escape.txt", content: "nope" }],
            notes: [],
            errors: [],
          }),
        }),
        { status: 200 },
      ),
    );

    await expect(handleGenerateRequest(request, fetchImpl)).rejects.toThrow(/Invalid project path/);
  });

  it("surfaces provider errors without returning a partial change", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "Bad key" } }), { status: 401 }),
    );

    await expect(handleGenerateRequest(request, fetchImpl)).rejects.toThrow(/Bad key/);
  });
});
