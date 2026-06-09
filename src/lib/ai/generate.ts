import { z } from "zod";

import { applyGeneratedChange } from "@/lib/project/apply-files";
import { GENERATED_CHANGE_JSON_SCHEMA, GeneratedChangeSchema } from "@/lib/project/schema";
import { validatePackageJson, validateProjectPath } from "@/lib/project/paths";
import type { GeneratedChange, ProjectFileMap, ProviderId } from "@/lib/project/types";

type FetchImpl = typeof fetch;

export class GenerateRequestError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export class ProviderRequestError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
  ) {
    super(message);
  }
}

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8000),
});

const GenerateRequestSchema = z.object({
  provider: z.enum(["openai", "anthropic"]),
  apiKey: z.string().min(1),
  model: z.string().min(1).max(120),
  prompt: z.string().min(1).max(12000),
  messages: z.array(MessageSchema).max(12).default([]),
  files: z.record(z.string()),
});

type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

export async function handleGenerateRequest(
  rawInput: unknown,
  fetchImpl: FetchImpl = fetch,
): Promise<{ change: GeneratedChange }> {
  const parsedInput = GenerateRequestSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    throw new GenerateRequestError(parsedInput.error.issues.map((issue) => issue.message).join("; "));
  }

  validateInputFiles(parsedInput.data.files);

  const change =
    parsedInput.data.provider === "openai"
      ? await callOpenAI(parsedInput.data, fetchImpl)
      : await callAnthropic(parsedInput.data, fetchImpl);

  const parsedChange = GeneratedChangeSchema.safeParse(change);
  if (!parsedChange.success) {
    throw new ProviderRequestError(
      `Provider returned invalid change: ${parsedChange.error.issues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  }

  const applied = applyGeneratedChange(parsedInput.data.files, parsedChange.data);
  if (!applied.ok) {
    throw new ProviderRequestError(applied.error);
  }

  return { change: applied.change };
}

async function callOpenAI(input: GenerateRequest, fetchImpl: FetchImpl): Promise<unknown> {
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      instructions: SYSTEM_PROMPT,
      input: buildUserPrompt(input),
      max_output_tokens: 7000,
      text: {
        format: {
          type: "json_schema",
          name: "project_change",
          strict: true,
          schema: GENERATED_CHANGE_JSON_SCHEMA,
        },
      },
    }),
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new ProviderRequestError(providerErrorMessage(data, "OpenAI request failed"), response.status);
  }

  const outputText = extractOpenAIOutputText(data);
  return parseJsonText(outputText, "OpenAI");
}

async function callAnthropic(input: GenerateRequest, fetchImpl: FetchImpl): Promise<unknown> {
  const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
      "x-api-key": input.apiKey,
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: 7000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(input) }],
      tools: [
        {
          name: "propose_files",
          description: "Return complete file replacements for the Vite React project.",
          input_schema: GENERATED_CHANGE_JSON_SCHEMA,
          strict: true,
        },
      ],
      tool_choice: { type: "tool", name: "propose_files" },
    }),
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new ProviderRequestError(providerErrorMessage(data, "Anthropic request failed"), response.status);
  }

  const toolInput = extractAnthropicToolInput(data);
  if (toolInput) return toolInput;

  const text = extractAnthropicText(data);
  return parseJsonText(text, "Anthropic");
}

function validateInputFiles(files: ProjectFileMap): void {
  for (const [filePath, content] of Object.entries(files)) {
    const pathResult = validateProjectPath(filePath);
    if (!pathResult.ok) {
      throw new GenerateRequestError(pathResult.error);
    }
    if (filePath === "package.json") {
      const packageResult = validatePackageJson(content);
      if (!packageResult.ok) {
        throw new GenerateRequestError(packageResult.error);
      }
    }
  }
}

function buildUserPrompt(input: GenerateRequest): string {
  const recentMessages = input.messages
    .slice(-8)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");
  const files = Object.entries(input.files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([filePath, content]) => `--- ${filePath}\n${truncateFile(content)}`)
    .join("\n\n");

  return `USER REQUEST
${input.prompt}

RECENT CHAT
${recentMessages || "(none)"}

CURRENT FILES
${files}
`;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      throw new ProviderRequestError(text, response.status);
    }
    throw new ProviderRequestError("Provider returned non-JSON response");
  }
}

function extractOpenAIOutputText(data: unknown): string {
  if (isRecord(data) && typeof data.output_text === "string") {
    return data.output_text;
  }

  if (isRecord(data) && Array.isArray(data.output)) {
    const chunks: string[] = [];
    for (const item of data.output) {
      if (!isRecord(item) || !Array.isArray(item.content)) continue;
      for (const content of item.content) {
        if (isRecord(content) && typeof content.text === "string") {
          chunks.push(content.text);
        }
      }
    }
    if (chunks.length > 0) return chunks.join("");
  }

  throw new ProviderRequestError("OpenAI response did not include output text");
}

function extractAnthropicToolInput(data: unknown): unknown | undefined {
  if (!isRecord(data) || !Array.isArray(data.content)) return undefined;

  for (const block of data.content) {
    if (
      isRecord(block) &&
      block.type === "tool_use" &&
      block.name === "propose_files" &&
      "input" in block
    ) {
      return block.input;
    }
  }

  return undefined;
}

function extractAnthropicText(data: unknown): string {
  if (!isRecord(data) || !Array.isArray(data.content)) {
    throw new ProviderRequestError("Anthropic response did not include content");
  }

  const text = data.content
    .filter((block): block is { type: string; text: string } => {
      return isRecord(block) && block.type === "text" && typeof block.text === "string";
    })
    .map((block) => block.text)
    .join("");

  if (!text) {
    throw new ProviderRequestError("Anthropic response did not include tool input");
  }

  return text;
}

function parseJsonText(text: string, provider: ProviderId | "OpenAI" | "Anthropic"): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(`${provider} returned malformed JSON`);
  }
}

function providerErrorMessage(data: unknown, fallback: string): string {
  if (isRecord(data)) {
    const error = data.error;
    if (typeof error === "string") return error;
    if (isRecord(error) && typeof error.message === "string") return error.message;
    if (typeof data.message === "string") return data.message;
  }
  return fallback;
}

function truncateFile(content: string): string {
  const limit = 16000;
  if (content.length <= limit) return content;
  return `${content.slice(0, limit)}\n/* truncated */`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const SYSTEM_PROMPT = `You generate complete Vite React project file replacements for a local-first UI builder.

Return only the structured response requested by the API. Do not include Markdown wrappers.

Rules:
- Produce complete file contents, never patches.
- Keep the project as Vite + React + TypeScript.
- Use only these editable paths: package.json, index.html, vite.config.ts, tsconfig.json, and files under src/.
- Do not create hidden files, absolute paths, parent directory paths, node_modules, public assets, or server files.
- Do not add dependencies beyond react, react-dom, lucide-react, vite, @vitejs/plugin-react, and typescript.
- Prefer self-contained React/CSS in src/App.tsx, src/styles.css, and optional src/components/* files.
- Preserve the existing app when the request is unclear and explain any limitation in notes or errors.`;
