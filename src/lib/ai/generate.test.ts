import { describe, expect, it, vi } from "vitest";

import { GenerateRequestError, handleGenerateRequest } from "@/lib/ai/generate";
import { createDefaultProjectFiles } from "@/lib/project/template";
import type { ProjectReference } from "@/lib/project/types";

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

  it("injects the built-in frontend-design generation skill by default", async () => {
    const change = {
      summary: "Built skilled notes app",
      files: [{ path: "src/App.tsx", content: "export default function App() { return <main>Notes</main>; }" }],
      notes: [],
      errors: [],
    };
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ output_text: JSON.stringify(change) }), { status: 200 }),
    );

    await handleGenerateRequest(request, fetchImpl);

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      input: Array<{ role: string; content: Array<{ type: string; text?: string }> }>;
    };
    const text = body.input[0].content.find((block) => block.type === "input_text")?.text;

    expect(text).toContain("GENERATION SKILL");
    expect(text).toContain("Name: frontend-design");
    expect(text).toContain("production-grade frontend interfaces");
    expect(text?.indexOf("GENERATION SKILL")).toBeLessThan(text?.indexOf("USER REQUEST") ?? -1);
  });

  it("injects a custom GitHub generation skill when provided", async () => {
    const change = {
      summary: "Built custom skill app",
      files: [{ path: "src/App.tsx", content: "export default function App() { return <main>Custom</main>; }" }],
      notes: [],
      errors: [],
    };
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ output_text: JSON.stringify(change) }), { status: 200 }),
    );

    await handleGenerateRequest(
      {
        ...request,
        generationSkill: {
          source: "github",
          name: "cinematic-ui",
          sourceUrl: "https://raw.githubusercontent.com/acme/skills/main/SKILL.md",
          content: "Use cinematic contrast, hard shadows, and compact production controls.",
          fetchedAt: "2026-06-09T12:00:00.000Z",
        },
      },
      fetchImpl,
    );

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      input: Array<{ role: string; content: Array<{ type: string; text?: string }> }>;
    };
    const text = body.input[0].content.find((block) => block.type === "input_text")?.text;

    expect(text).toContain("Name: cinematic-ui");
    expect(text).toContain("Source URL: https://raw.githubusercontent.com/acme/skills/main/SKILL.md");
    expect(text).toContain("Use cinematic contrast");
    expect(text).not.toContain("production-grade frontend interfaces");
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

  it("sends text, image, and PDF references to OpenAI using Responses content blocks", async () => {
    const change = {
      summary: "Used references",
      files: [{ path: "src/App.tsx", content: "export default function App() { return <main>Referenced</main>; }" }],
      notes: [],
      errors: [],
    };
    const files = {
      ...request.files,
      "src/references/brief.md": "# Brief\nUse the uploaded material.",
    };
    const references: ProjectReference[] = [
      textReference("brief.md", "src/references/brief.md", 34),
      binaryReference("hero.png", "image/png", "src/references/hero.png", "AQIDBA=="),
      binaryReference("spec.pdf", "application/pdf", "src/references/spec.pdf", "JVBERi0="),
    ];
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ output_text: JSON.stringify(change) }), { status: 200 }),
    );

    await handleGenerateRequest({ ...request, files, references }, fetchImpl);

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init?.body)) as {
      input: Array<{ role: string; content: Array<Record<string, unknown>> }>;
    };
    const content = body.input[0].content;

    expect(content).toContainEqual(
      expect.objectContaining({
        type: "input_image",
        image_url: "data:image/png;base64,AQIDBA==",
      }),
    );
    expect(content).toContainEqual(
      expect.objectContaining({
        type: "input_file",
        filename: "spec.pdf",
        file_data: "data:application/pdf;base64,JVBERi0=",
      }),
    );
    const textBlock = content.find((block) => block.type === "input_text");
    expect(textBlock?.text).toContain("REFERENCE FILES");
    expect(textBlock?.text).toContain("src/references/brief.md");
    expect(textBlock?.text).toContain("# Brief");
  });

  it("sends image, PDF, and text references to Anthropic using Messages content blocks", async () => {
    const change = {
      summary: "Used Claude references",
      files: [{ path: "src/App.tsx", content: "export default function App() { return <main>Claude</main>; }" }],
      notes: [],
      errors: [],
    };
    const files = {
      ...request.files,
      "src/references/brief.md": "# Brief\nUse the uploaded material.",
    };
    const references: ProjectReference[] = [
      textReference("brief.md", "src/references/brief.md", 34),
      binaryReference("hero.png", "image/png", "src/references/hero.png", "AQIDBA=="),
      binaryReference("spec.pdf", "application/pdf", "src/references/spec.pdf", "JVBERi0="),
    ];
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          content: [{ type: "tool_use", name: "propose_files", input: change }],
        }),
        { status: 200 },
      ),
    );

    await handleGenerateRequest(
      { ...request, provider: "anthropic", model: "claude-sonnet-4-5", files, references },
      fetchImpl,
    );

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init?.body)) as {
      messages: Array<{ role: string; content: Array<Record<string, unknown>> }>;
    };
    const content = body.messages[0].content;

    expect(content).toContainEqual(
      expect.objectContaining({
        type: "image",
        source: { type: "base64", media_type: "image/png", data: "AQIDBA==" },
      }),
    );
    expect(content).toContainEqual(
      expect.objectContaining({
        type: "document",
        title: "spec.pdf",
        source: { type: "base64", media_type: "application/pdf", data: "JVBERi0=" },
      }),
    );
    expect(content).toContainEqual(
      expect.objectContaining({
        type: "document",
        title: "brief.md",
        source: { type: "text", media_type: "text/plain", data: "# Brief\nUse the uploaded material." },
      }),
    );
    expect(content.at(-1)).toEqual(expect.objectContaining({ type: "text" }));
  });

  it("aceita provider claude-cli sem apiKey e roteia pelo cli runner", async () => {
    const runner = vi.fn(async () => ({
      stdout: JSON.stringify({
        result: JSON.stringify({
          summary: "ok",
          files: [{ path: "src/App.tsx", content: "export default function App() { return <main>Button</main>; }" }],
          notes: [],
          errors: [],
        }),
      }),
      stderr: "",
    }));
    const result = await handleGenerateRequest(
      {
        provider: "claude-cli",
        model: "",
        prompt: "faz um botão",
        files: { "package.json": "{}" },
      },
      fetch,
      runner,
    );
    expect(result.change.summary).toBe("ok");
  });

  it("rejeita provider openai sem apiKey", async () => {
    await expect(
      handleGenerateRequest(
        { provider: "openai", model: "gpt-5-mini", prompt: "x", files: { "package.json": "{}" } },
        fetch,
      ),
    ).rejects.toBeInstanceOf(GenerateRequestError);
  });

  it("aceita provider codex-cli sem apiKey e roteia pelo cli runner", async () => {
    const runner = vi.fn(async () => ({
      stdout: JSON.stringify({
        text: JSON.stringify({
          summary: "ok",
          files: [{ path: "src/App.tsx", content: "export default function App() { return <main>Button</main>; }" }],
          notes: [],
          errors: [],
        }),
      }),
      stderr: "",
    }));
    const result = await handleGenerateRequest(
      {
        provider: "codex-cli",
        model: "",
        prompt: "faz um botão",
        files: { "package.json": "{}" },
      },
      fetch,
      runner,
    );
    expect(result.change.summary).toBe("ok");
  });

  it("rejeita provider anthropic sem apiKey", async () => {
    await expect(
      handleGenerateRequest(
        { provider: "anthropic", model: "claude-sonnet-4-5", prompt: "x", files: { "package.json": "{}" } },
        fetch,
      ),
    ).rejects.toBeInstanceOf(GenerateRequestError);
  });
});

function textReference(name: string, projectPath: string, size: number): ProjectReference {
  return {
    id: `ref-${name}`,
    name,
    mimeType: "text/markdown",
    size,
    kind: "text",
    projectPath,
    createdAt: "2026-06-09T12:00:00.000Z",
  };
}

function binaryReference(
  name: string,
  mimeType: string,
  projectPath: string,
  dataBase64: string,
): ProjectReference {
  return {
    id: `ref-${name}`,
    name,
    mimeType,
    size: 4,
    kind: "binary",
    projectPath,
    createdAt: "2026-06-09T12:00:00.000Z",
    dataBase64,
  };
}
