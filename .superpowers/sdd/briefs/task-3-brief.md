# Task 3: Módulo `cli-agent.ts` (core)

O coração da feature: monta o prompt, spawna o binário `claude`/`codex` em modo não-interativo, parseia a saída, mapeia erros. Totalmente testável via `runner` injetável (mesmo padrão do `fetchImpl` em generate.ts).

## Global Constraints (aplicam a todas as tasks)
- Next.js 16 / React 19 / TypeScript. Zod para validação.
- Nomes de binário FIXOS: `claude` e `codex`, overridáveis só por env `LIKE_FIGMA_CLAUDE_BIN` / `LIKE_FIGMA_CODEX_BIN`.
- Spawn sempre com `execFile` SEM shell; prompt entra por STDIN, nunca por argv.
- cwd do subprocesso = tempdir vazio criado com `mkdtemp`, removido em `finally`.
- Timeout do subprocesso = 120000 ms; `maxBuffer` = 20 MB.
- TDD: teste falhando → implementação mínima → teste passando → commit.
- Comandos: `npm test`, `npm run typecheck`, `npm run lint`.

## Files
- Create: `src/lib/ai/cli-agent.ts`
- Test: `src/lib/ai/cli-agent.test.ts`

## Interfaces
- Consumes: `ProviderRequestError` de `@/lib/ai/errors` (já existe, criado na Task 1).
- Produces:
  - `type CliRunResult = { stdout: string; stderr: string }`
  - `type CliRunner = (bin: string, args: string[], options: { input: string; cwd: string; timeoutMs: number }) => Promise<CliRunResult>`
  - `interface CliAgentInput { provider: "claude-cli" | "codex-cli"; model?: string; systemPrompt: string; userPrompt: string }`
  - `async function callCliAgent(input: CliAgentInput, runner?: CliRunner): Promise<unknown>` — retorna o candidato a `GeneratedChange` (unknown), igual `callOpenAI`/`callAnthropic`.
  - `async function isBinaryAvailable(bin: string, env?: NodeJS.ProcessEnv, accessFn?: typeof import("node:fs/promises").access): Promise<boolean>`
  - `async function detectCliAgents(env?, accessFn?): Promise<{ claude: boolean; codex: boolean }>`

## Steps

### Step 1: Escrever os testes falhando
Criar `src/lib/ai/cli-agent.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";

import { callCliAgent, isBinaryAvailable, type CliRunner } from "@/lib/ai/cli-agent";
import { ProviderRequestError } from "@/lib/ai/errors";

const change = { summary: "ok", files: [], notes: [], errors: [] };
const base = { systemPrompt: "SYS", userPrompt: "faz um card" };

it("parseia o envelope JSON do Claude", async () => {
  const runner: CliRunner = async (bin, args, opts) => {
    expect(bin).toBe("claude");
    expect(args).toEqual(["-p", "--output-format", "json"]);
    expect(opts.input).toContain("faz um card");
    return { stdout: JSON.stringify({ result: JSON.stringify(change) }), stderr: "" };
  };
  const out = await callCliAgent({ ...base, provider: "claude-cli" }, runner);
  expect(out).toEqual(change);
});

it("passa --model quando informado", async () => {
  const runner: CliRunner = async (_bin, args) => {
    expect(args).toEqual(["-p", "--output-format", "json", "--model", "claude-opus-4-8"]);
    return { stdout: JSON.stringify({ result: JSON.stringify(change) }), stderr: "" };
  };
  await callCliAgent({ ...base, provider: "claude-cli", model: "claude-opus-4-8" }, runner);
});

it("parseia a saída JSONL do Codex", async () => {
  const stdout = [
    JSON.stringify({ type: "thread.started" }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(change) } }),
  ].join("\n");
  const runner: CliRunner = async (bin, args) => {
    expect(bin).toBe("codex");
    expect(args).toEqual(["exec", "--json"]);
    return { stdout, stderr: "" };
  };
  const out = await callCliAgent({ ...base, provider: "codex-cli" }, runner);
  expect(out).toEqual(change);
});

it("extrai JSON mesmo com cercas markdown na saída do Claude", async () => {
  const runner: CliRunner = async () => ({
    stdout: JSON.stringify({ result: "```json\n" + JSON.stringify(change) + "\n```" }),
    stderr: "",
  });
  const out = await callCliAgent({ ...base, provider: "claude-cli" }, runner);
  expect(out).toEqual(change);
});

it("mapeia ENOENT para erro amigável", async () => {
  const runner: CliRunner = async () => {
    const err = new Error("spawn claude ENOENT") as Error & { code?: string };
    err.code = "ENOENT";
    throw err;
  };
  await expect(callCliAgent({ ...base, provider: "claude-cli" }, runner)).rejects.toThrow(/não encontrado no PATH/);
});

it("mapeia exit != 0 incluindo stderr", async () => {
  const runner: CliRunner = async () => {
    const err = new Error("Command failed") as Error & { stderr?: string };
    err.stderr = "boom detail";
    throw err;
  };
  await expect(callCliAgent({ ...base, provider: "codex-cli" }, runner)).rejects.toThrow(/boom detail/);
});

it("erra em saída não-JSON", async () => {
  const runner: CliRunner = async () => ({ stdout: JSON.stringify({ result: "não é json" }), stderr: "" });
  await expect(callCliAgent({ ...base, provider: "claude-cli" }, runner)).rejects.toBeInstanceOf(ProviderRequestError);
});

it("isBinaryAvailable acha binário no PATH", async () => {
  const access = vi.fn().mockResolvedValueOnce(undefined);
  const ok = await isBinaryAvailable("claude", { PATH: "/usr/bin" } as NodeJS.ProcessEnv, access);
  expect(ok).toBe(true);
});

it("isBinaryAvailable retorna false quando ausente", async () => {
  const access = vi.fn().mockRejectedValue(new Error("no"));
  const ok = await isBinaryAvailable("codex", { PATH: "/usr/bin:/bin" } as NodeJS.ProcessEnv, access);
  expect(ok).toBe(false);
});
```

### Step 2: Rodar para ver falhar
Run: `npm test -- src/lib/ai/cli-agent.test.ts`
Expected: FAIL ("cannot find module cli-agent" / exports indefinidos).

### Step 3: Implementar `cli-agent.ts`
```ts
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
```

### Step 4: Rodar os testes
Run: `npm test -- src/lib/ai/cli-agent.test.ts`
Expected: PASS (todos os casos).

### Step 5: Typecheck + lint
Run: `npm run typecheck && npm run lint`
Expected: sem erros.

### Step 6: Commit
```bash
git add src/lib/ai/cli-agent.ts src/lib/ai/cli-agent.test.ts
git commit -m "feat: add cli-agent module for claude/codex binaries"
```
