import { z } from "zod";

import { callCliAgent, type CliRunner } from "@/lib/ai/cli-agent";
import { GenerateRequestError, ProviderRequestError } from "@/lib/ai/errors";
import { applyGeneratedChange } from "@/lib/project/apply-files";
import {
  createDefaultGenerationSkill,
  generationSkillPromptContent,
  MAX_GENERATION_SKILL_CONTENT_BYTES,
} from "@/lib/project/generation-skill";
import { GENERATED_CHANGE_JSON_SCHEMA, GeneratedChangeSchema } from "@/lib/project/schema";
import { validatePackageJson, validateProjectPath } from "@/lib/project/paths";
import {
  isPdfReference,
  isSupportedProviderImage,
  ReferenceValidationError,
  referenceToDataUrl,
  validateProjectReferences,
} from "@/lib/project/references";
import type { GeneratedChange, ProjectFileMap, ProjectReference, ProviderId } from "@/lib/project/types";

type FetchImpl = typeof fetch;

export { GenerateRequestError, ProviderRequestError };

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8000),
});

const ProjectReferenceSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(240),
  mimeType: z.string().min(1).max(120),
  size: z.number().int().nonnegative(),
  kind: z.enum(["text", "binary"]),
  projectPath: z.string().min(1).max(240),
  createdAt: z.string().min(1).max(80),
  dataBase64: z.string().optional(),
});

const GenerationSkillSchema = z
  .discriminatedUnion("source", [
    z.object({
      source: z.literal("builtin"),
      name: z.literal("frontend-design"),
    }),
    z.object({
      source: z.literal("github"),
      name: z.string().min(1).max(120),
      sourceUrl: z.string().url().max(1000),
      content: z.string().min(1).max(MAX_GENERATION_SKILL_CONTENT_BYTES),
      fetchedAt: z.string().min(1).max(80),
    }),
  ])
  .default(createDefaultGenerationSkill);

const GenerateRequestSchema = z
  .object({
    provider: z.enum(["openai", "anthropic", "claude-cli", "codex-cli"]),
    apiKey: z.string().max(400).default(""),
    model: z.string().max(120).default(""),
    prompt: z.string().min(1).max(12000),
    messages: z.array(MessageSchema).max(12).default([]),
    files: z.record(z.string()),
    references: z.array(ProjectReferenceSchema).max(10).default([]),
    generationSkill: GenerationSkillSchema,
  })
  .superRefine((value, ctx) => {
    const isHttp = value.provider === "openai" || value.provider === "anthropic";
    if (isHttp && value.apiKey.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "apiKey is required for HTTP providers",
        path: ["apiKey"],
      });
    }
    if (isHttp && value.model.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "model is required for HTTP providers",
        path: ["model"],
      });
    }
  });

type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

type OpenAIContentBlock =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "auto" }
  | { type: "input_file"; filename: string; file_data: string };

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    }
  | {
      type: "document";
      title: string;
      context?: string;
      source:
        | { type: "text"; media_type: "text/plain"; data: string }
        | { type: "base64"; media_type: string; data: string };
    };

export async function handleGenerateRequest(
  rawInput: unknown,
  fetchImpl: FetchImpl = fetch,
  cliRunner?: CliRunner,
  signal?: AbortSignal,
): Promise<{ change: GeneratedChange }> {
  const parsedInput = GenerateRequestSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    throw new GenerateRequestError(parsedInput.error.issues.map((issue) => issue.message).join("; "));
  }

  validateInputFiles(parsedInput.data.files);
  validateReferences(parsedInput.data.references, parsedInput.data.files);

  const change = await dispatchProvider(parsedInput.data, fetchImpl, cliRunner, signal);

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

async function dispatchProvider(
  input: GenerateRequest,
  fetchImpl: FetchImpl,
  cliRunner?: CliRunner,
  signal?: AbortSignal,
): Promise<unknown> {
  switch (input.provider) {
    case "openai":
      return callOpenAI(input, fetchImpl, signal);
    case "anthropic":
      return callAnthropic(input, fetchImpl, signal);
    case "claude-cli":
    case "codex-cli":
      return callCliAgent(
        {
          provider: input.provider,
          model: input.model,
          systemPrompt: SYSTEM_PROMPT,
          userPrompt: buildUserPrompt(input),
          schemaHint: JSON.stringify(GENERATED_CHANGE_JSON_SCHEMA),
        },
        cliRunner,
        signal,
      );
  }
}

async function callOpenAI(
  input: GenerateRequest,
  fetchImpl: FetchImpl,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      instructions: SYSTEM_PROMPT,
      input: [{ role: "user", content: buildOpenAIContent(input) }],
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

async function callAnthropic(
  input: GenerateRequest,
  fetchImpl: FetchImpl,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
      "x-api-key": input.apiKey,
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: 7000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildAnthropicContent(input) }],
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

function validateReferences(references: ProjectReference[], files: ProjectFileMap): void {
  try {
    validateProjectReferences(references, files);
  } catch (error) {
    if (error instanceof ReferenceValidationError) {
      throw new GenerateRequestError(error.message);
    }
    throw error;
  }
}

function buildOpenAIContent(input: GenerateRequest): OpenAIContentBlock[] {
  const content: OpenAIContentBlock[] = [];

  for (const reference of sortReferences(input.references)) {
    if (reference.kind !== "binary" || !reference.dataBase64) continue;
    const dataUrl = referenceToDataUrl(reference);
    if (!dataUrl) continue;

    if (isSupportedProviderImage(reference)) {
      content.push({ type: "input_image", image_url: dataUrl, detail: "auto" });
      continue;
    }

    if (isPdfReference(reference)) {
      content.push({ type: "input_file", filename: reference.name, file_data: dataUrl });
    }
  }

  content.push({ type: "input_text", text: buildUserPrompt(input) });
  return content;
}

function buildAnthropicContent(input: GenerateRequest): AnthropicContentBlock[] {
  const content: AnthropicContentBlock[] = [];

  for (const reference of sortReferences(input.references)) {
    if (reference.kind === "text") {
      content.push({
        type: "document",
        title: reference.name,
        context: `Project reference file at ${reference.projectPath}.`,
        source: {
          type: "text",
          media_type: "text/plain",
          data: input.files[reference.projectPath] ?? "",
        },
      });
      continue;
    }

    if (!reference.dataBase64) continue;

    if (isSupportedProviderImage(reference)) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: reference.mimeType, data: reference.dataBase64 },
      });
      continue;
    }

    if (isPdfReference(reference)) {
      content.push({
        type: "document",
        title: reference.name,
        context: `Project reference file at ${reference.projectPath}.`,
        source: { type: "base64", media_type: reference.mimeType, data: reference.dataBase64 },
      });
    }
  }

  content.push({ type: "text", text: buildUserPrompt(input) });
  return content;
}

function buildUserPrompt(input: GenerateRequest): string {
  const recentMessages = input.messages
    .slice(-8)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");
  const files = Object.entries(input.files)
    .filter(([filePath]) => !filePath.startsWith("src/references/"))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([filePath, content]) => `--- ${filePath}\n${truncateFile(content)}`)
    .join("\n\n");
  const references = buildReferencePrompt(input);
  const generationSkill = buildGenerationSkillPrompt(input);

  return `GENERATION SKILL
${generationSkill}

USER REQUEST
${input.prompt}

RECENT CHAT
${recentMessages || "(none)"}

CURRENT FILES
${files}

REFERENCE FILES
${references}
`;
}

function buildGenerationSkillPrompt(input: GenerateRequest): string {
  const metadata =
    input.generationSkill.source === "github"
      ? `Name: ${input.generationSkill.name}\nSource URL: ${input.generationSkill.sourceUrl}\nFetched at: ${input.generationSkill.fetchedAt}`
      : `Name: ${input.generationSkill.name}\nSource: built-in`;

  return `${metadata}

Instructions:
${generationSkillPromptContent(input.generationSkill)}`;
}

function buildReferencePrompt(input: GenerateRequest): string {
  if (input.references.length === 0) return "(none)";

  return sortReferences(input.references)
    .map((reference) => {
      const metadata = [
        `--- ${reference.projectPath}`,
        `Name: ${reference.name}`,
        `Type: ${reference.mimeType}`,
        `Size: ${formatBytes(reference.size)}`,
      ];

      if (reference.kind === "text") {
        return `${metadata.join("\n")}\n\n${truncateFile(input.files[reference.projectPath] ?? "")}`;
      }

      return `${metadata.join("\n")}\n${binaryReferencePromptNote(reference, input.provider)}`;
    })
    .join("\n\n");
}

function binaryReferencePromptNote(reference: ProjectReference, provider: ProviderId): string {
  if (provider === "claude-cli" || provider === "codex-cli") {
    return "Metadata only; the CLI agent receives a text prompt and does not get this file as a block.";
  }

  if (isSupportedProviderImage(reference)) {
    return provider === "openai"
      ? "Attached as an input_image block."
      : "Attached as an image content block.";
  }

  if (isPdfReference(reference)) {
    return provider === "openai"
      ? "Attached as an input_file block."
      : "Attached as a document content block.";
  }

  return `Metadata only; ${provider} does not receive this file type as a multimodal block.`;
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

function sortReferences(references: ProjectReference[]): ProjectReference[] {
  return [...references].sort((a, b) => a.projectPath.localeCompare(b.projectPath));
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const SYSTEM_PROMPT = `You generate complete Vite React project file replacements for a local-first UI builder.

Return only the structured response requested by the API. Do not include Markdown wrappers.

Rules:
- Produce complete file contents, never patches.
- Keep the project as Vite + React + TypeScript.
- Use only these editable paths: package.json, index.html, vite.config.ts, tsconfig.json, and files under src/ except src/references/.
- Treat files under src/references/ as user-provided reference context. Do not create, modify, or delete src/references/ files.
- Do not create hidden files, absolute paths, parent directory paths, node_modules, public assets, or server files.
- Do not add dependencies beyond react, react-dom, lucide-react, vite, @vitejs/plugin-react, and typescript.
- lucide-react does NOT include brand or social icons (there is no Instagram, GitHub, Twitter/X, Facebook, LinkedIn, YouTube, TikTok, WhatsApp, Discord, or similar). For brand/social marks use an inline <svg> or a text label. Only import lucide-react icons you are certain exist — a single missing icon import makes the whole preview render blank.
- Prefer self-contained React/CSS in src/App.tsx, src/styles.css, and optional src/components/* files.
- Preserve the existing app when the request is unclear and explain any limitation in notes or errors.`;
