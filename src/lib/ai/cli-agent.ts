// src/lib/ai/cli-agent.ts
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access as fsAccess, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { ProviderRequestError } from "@/lib/ai/errors";

export type CliRunResult = { stdout: string; stderr: string };

export type CliRunner = (
  bin: string,
  args: string[],
  options: { input: string; cwd: string; timeoutMs: number },
) => Promise<CliRunResult>;

export interface CliAgentInput {
  provider: "claude-cli" | "codex-cli";
  model?: string;
  systemPrompt: string;
  userPrompt: string;
}

const TIMEOUT_MS = 120_000;
const MAX_BUFFER = 20 * 1024 * 1024;

const INSTRUCTION =
  "Return ONLY a single JSON object matching the required schema. No markdown fences, no prose.";

function binFor(provider: CliAgentInput["provider"]): string {
  if (provider === "claude-cli") return process.env.LIKE_FIGMA_CLAUDE_BIN ?? "claude";
  return process.env.LIKE_FIGMA_CODEX_BIN ?? "codex";
}

function argsFor(provider: CliAgentInput["provider"], model?: string): string[] {
  const trimmed = model?.trim();
  if (provider === "claude-cli") {
    const args = ["-p", "--output-format", "json"];
    if (trimmed) args.push("--model", trimmed);
    return args;
  }
  const args = ["exec", "--json"];
  if (trimmed) args.push("--model", trimmed);
  return args;
}

export async function callCliAgent(input: CliAgentInput, runner: CliRunner = defaultCliRunner): Promise<unknown> {
  const bin = binFor(input.provider);
  const args = argsFor(input.provider, input.model);
  const prompt = `${input.systemPrompt}\n\n${INSTRUCTION}\n\n${input.userPrompt}`;

  const dir = await mkdtemp(join(tmpdir(), "figma-cli-"));
  let result: CliRunResult;
  try {
    result = await runner(bin, args, { input: prompt, cwd: dir, timeoutMs: TIMEOUT_MS });
  } catch (error) {
    throw mapRunnerError(error, bin);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  const text =
    input.provider === "claude-cli"
      ? extractClaudeResult(result.stdout, bin)
      : extractCodexText(result.stdout, bin);

  return parseGeneratedChangeText(text, bin);
}

function mapRunnerError(error: unknown, bin: string): ProviderRequestError {
  const err = error as { code?: string; killed?: boolean; stderr?: string; message?: string };
  if (err?.code === "ENOENT") {
    return new ProviderRequestError(`${bin} não encontrado no PATH`, 502);
  }
  if (err?.killed) {
    return new ProviderRequestError(`Geração pela CLI (${bin}) excedeu o tempo limite`, 504);
  }
  const detail = (err?.stderr ?? "").trim().slice(-500) || err?.message || "erro desconhecido";
  return new ProviderRequestError(`CLI ${bin} falhou: ${detail}`, 502);
}

function extractClaudeResult(stdout: string, bin: string): string {
  let envelope: unknown;
  try {
    envelope = JSON.parse(stdout);
  } catch {
    throw new ProviderRequestError(`CLI ${bin} retornou envelope não-JSON`);
  }
  if (
    envelope &&
    typeof envelope === "object" &&
    typeof (envelope as { result?: unknown }).result === "string"
  ) {
    return (envelope as { result: string }).result;
  }
  throw new ProviderRequestError(`CLI ${bin} não retornou campo "result"`);
}

function extractCodexText(stdout: string, bin: string): string {
  const texts: string[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event: unknown;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const candidate =
      pickString(event, ["item", "text"]) ??
      pickString(event, ["text"]) ??
      pickString(event, ["message"]) ??
      pickString(event, ["item", "message"]);
    if (candidate) texts.push(candidate);
  }
  const last = texts.at(-1);
  if (!last) throw new ProviderRequestError(`CLI ${bin} não produziu mensagem de agente`);
  return last;
}

function pickString(value: unknown, path: string[]): string | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : undefined;
}

function parseGeneratedChangeText(text: string, bin: string): unknown {
  const json = extractJsonObject(text);
  try {
    return JSON.parse(json);
  } catch {
    throw new ProviderRequestError(`CLI ${bin} retornou JSON malformado`);
  }
}

function extractJsonObject(text: string): string {
  const fenced = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return fenced;
  return fenced.slice(start, end + 1);
}

const defaultCliRunner: CliRunner = (bin, args, { input, cwd, timeoutMs }) =>
  new Promise<CliRunResult>((resolve, reject) => {
    const child = execFile(
      bin,
      args,
      { cwd, timeout: timeoutMs, maxBuffer: MAX_BUFFER },
      (error, stdout, stderr) => {
        if (error) {
          (error as { stderr?: string }).stderr = stderr;
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
    child.stdin?.end(input);
  });

export async function isBinaryAvailable(
  bin: string,
  env: NodeJS.ProcessEnv = process.env,
  accessFn: typeof fsAccess = fsAccess,
): Promise<boolean> {
  const override =
    bin === "claude" ? env.LIKE_FIGMA_CLAUDE_BIN : bin === "codex" ? env.LIKE_FIGMA_CODEX_BIN : undefined;
  const target = override ?? bin;

  if (target.includes("/")) {
    try {
      await accessFn(target, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  const dirs = (env.PATH ?? "").split(delimiter).filter(Boolean);
  for (const dir of dirs) {
    try {
      await accessFn(join(dir, target), constants.X_OK);
      return true;
    } catch {
      // continue
    }
  }
  return false;
}

export async function detectCliAgents(
  env: NodeJS.ProcessEnv = process.env,
  accessFn: typeof fsAccess = fsAccess,
): Promise<{ claude: boolean; codex: boolean }> {
  const [claude, codex] = await Promise.all([
    isBinaryAvailable("claude", env, accessFn),
    isBinaryAvailable("codex", env, accessFn),
  ]);
  return { claude, codex };
}
