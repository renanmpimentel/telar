# CLI Agent Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar os providers `claude-cli` e `codex-cli` ao like-figma, que geram um `GeneratedChange` invocando o binário local `claude`/`codex` em modo não-interativo, reusando todo o pipeline existente.

**Architecture:** Um novo módulo `cli-agent.ts` spawna o binário via `execFile` (sem shell, prompt via stdin, cwd em tempdir vazio) e devolve o mesmo JSON `GeneratedChange` dos providers HTTP. `handleGenerateRequest` ganha o dispatch para os dois casos CLI. As classes de erro são extraídas para `errors.ts` para evitar import circular. Uma rota `GET /api/agents` reporta quais binários existem, e a UI mostra os providers CLI condicionalmente, escondendo o campo de API key.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, Vitest, `node:child_process`, `node:fs/promises`.

## Global Constraints

- Projeto gerado permanece Vite + React + TypeScript (inalterado).
- Nomes de binário são fixos: `claude` e `codex`, overridáveis apenas por env `LIKE_FIGMA_CLAUDE_BIN` / `LIKE_FIGMA_CODEX_BIN`.
- Spawn sempre com `execFile` **sem shell**; prompt entra por **stdin**, nunca por argv.
- cwd do subprocesso = tempdir vazio criado com `mkdtemp`, removido em `finally`.
- Timeout do subprocesso = 120000 ms; `maxBuffer` = 20 MB.
- Providers CLI **não** usam API key; campo de modelo é opcional (só passa `--model` se preenchido).
- Referências de texto entram no prompt; imagem/PDF entram apenas como metadado no modo CLI.
- Todo passo de código segue TDD: teste falhando → implementação mínima → teste passando → commit.
- Comandos: `npm test` (vitest), `npm run typecheck`, `npm run lint`, `npm run build`.

---

### Task 1: Extrair classes de erro para `errors.ts`

Refactor puro que quebra o futuro ciclo de import entre `generate.ts` e `cli-agent.ts`. Sem mudança de comportamento.

**Files:**
- Create: `src/lib/ai/errors.ts`
- Modify: `src/lib/ai/generate.ts` (remove as duas classes, importa e re-exporta de `errors.ts`)

**Interfaces:**
- Produces: `GenerateRequestError` (`constructor(message: string, status = 400)`, campo `status: number`) e `ProviderRequestError` (`constructor(message: string, status = 502)`, campo `status: number`), exportadas de `src/lib/ai/errors.ts` e re-exportadas de `src/lib/ai/generate.ts`.

- [ ] **Step 1: Criar `errors.ts`**

```ts
// src/lib/ai/errors.ts
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
```

- [ ] **Step 2: Remover as classes de `generate.ts` e importar de `errors.ts`**

Em `src/lib/ai/generate.ts`, apagar os dois blocos `export class GenerateRequestError {...}` e `export class ProviderRequestError {...}` (linhas ~22-40). Adicionar no topo, junto aos outros imports:

```ts
import { GenerateRequestError, ProviderRequestError } from "@/lib/ai/errors";
```

E logo abaixo dos imports, re-exportar para não quebrar `route.ts`:

```ts
export { GenerateRequestError, ProviderRequestError };
```

- [ ] **Step 3: Rodar a suíte para garantir que nada quebrou**

Run: `npm test -- src/lib/ai/generate.test.ts`
Expected: PASS (mesmos testes de antes).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/errors.ts src/lib/ai/generate.ts
git commit -m "refactor: extract AI error classes into errors.ts"
```

---

### Task 2: Estender `ProviderId` e o schema de request

Adiciona os dois novos providers ao tipo e ao Zod, tornando `apiKey`/`model` condicionais.

**Files:**
- Modify: `src/lib/project/types.ts:3`
- Modify: `src/lib/ai/generate.ts` (GenerateRequestSchema, ~linha 70-88)
- Test: `src/lib/ai/generate.test.ts`

**Interfaces:**
- Produces: `ProviderId = "openai" | "anthropic" | "claude-cli" | "codex-cli"`. `GenerateRequestSchema` aceita os 4 providers; exige `apiKey` e `model` não-vazios apenas para `openai`/`anthropic`.

- [ ] **Step 1: Escrever os testes falhando**

Adicionar em `src/lib/ai/generate.test.ts` (usar o mesmo helper de request válido já existente no arquivo; se não houver, construir o objeto inline com `files: { "package.json": "{}" }` e demais campos mínimos):

```ts
it("aceita provider claude-cli sem apiKey", async () => {
  const runner = async () => ({
    stdout: JSON.stringify({
      result: JSON.stringify({ summary: "ok", files: [], notes: [], errors: [] }),
    }),
    stderr: "",
  });
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
```

Garantir que `GenerateRequestError` está importado no topo do teste.

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test -- src/lib/ai/generate.test.ts`
Expected: FAIL (o schema só conhece openai/anthropic; `handleGenerateRequest` ainda não aceita 3º argumento).

> Nota: o 3º argumento `runner` e o dispatch CLI são implementados na Task 4; estes testes só passam totalmente ao fim da Task 4. Deixe-os falhando e siga — os passos abaixo desta task cobrem apenas o schema.

- [ ] **Step 3: Estender `ProviderId`**

Em `src/lib/project/types.ts` linha 3:

```ts
export type ProviderId = "openai" | "anthropic" | "claude-cli" | "codex-cli";
```

- [ ] **Step 4: Atualizar o schema em `generate.ts`**

Substituir as três linhas do `GenerateRequestSchema`:

```ts
  provider: z.enum(["openai", "anthropic"]),
  apiKey: z.string().min(1),
  model: z.string().min(1).max(120),
```

por:

```ts
  provider: z.enum(["openai", "anthropic", "claude-cli", "codex-cli"]),
  apiKey: z.string().max(400).default(""),
  model: z.string().max(120).default(""),
```

E envolver o `z.object({...})` com um refine ao final da definição (após a chave de fechamento do objeto, antes do `;`):

```ts
}).superRefine((value, ctx) => {
  const isHttp = value.provider === "openai" || value.provider === "anthropic";
  if (isHttp && value.apiKey.trim().length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "apiKey is required for HTTP providers", path: ["apiKey"] });
  }
  if (isHttp && value.model.trim().length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "model is required for HTTP providers", path: ["model"] });
  }
});
```

- [ ] **Step 5: Typecheck (os testes CLI ainda falham até a Task 4)**

Run: `npm run typecheck`
Expected: sem erros de tipo. `GenerateRequest` continua inferível.

- [ ] **Step 6: Commit**

```bash
git add src/lib/project/types.ts src/lib/ai/generate.ts src/lib/ai/generate.test.ts
git commit -m "feat: extend ProviderId and request schema for CLI providers"
```

---

### Task 3: Módulo `cli-agent.ts` (core)

O coração: monta o prompt, spawna o binário, parseia a saída, mapeia erros. Totalmente testável via `runner` injetável.

**Files:**
- Create: `src/lib/ai/cli-agent.ts`
- Test: `src/lib/ai/cli-agent.test.ts`

**Interfaces:**
- Consumes: `ProviderRequestError` de `@/lib/ai/errors`.
- Produces:
  - `type CliRunResult = { stdout: string; stderr: string }`
  - `type CliRunner = (bin: string, args: string[], options: { input: string; cwd: string; timeoutMs: number }) => Promise<CliRunResult>`
  - `interface CliAgentInput { provider: "claude-cli" | "codex-cli"; model?: string; systemPrompt: string; userPrompt: string }`
  - `async function callCliAgent(input: CliAgentInput, runner?: CliRunner): Promise<unknown>` — retorna o candidato a `GeneratedChange` (unknown), igual `callOpenAI`/`callAnthropic`.
  - `async function isBinaryAvailable(bin: string, env?: NodeJS.ProcessEnv, accessFn?: typeof import("node:fs/promises").access): Promise<boolean>`
  - `async function detectCliAgents(env?, accessFn?): Promise<{ claude: boolean; codex: boolean }>`

- [ ] **Step 1: Escrever os testes falhando**

```ts
// src/lib/ai/cli-agent.test.ts
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

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test -- src/lib/ai/cli-agent.test.ts`
Expected: FAIL ("cannot find module cli-agent" / exports indefinidos).

- [ ] **Step 3: Implementar `cli-agent.ts`**

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

- [ ] **Step 4: Rodar os testes**

Run: `npm test -- src/lib/ai/cli-agent.test.ts`
Expected: PASS (todos os casos).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/cli-agent.ts src/lib/ai/cli-agent.test.ts
git commit -m "feat: add cli-agent module for claude/codex binaries"
```

---

### Task 4: Ligar o dispatch em `handleGenerateRequest`

Faz o request CLI fluir de ponta a ponta e corrige o texto de referência binária para o modo CLI.

**Files:**
- Modify: `src/lib/ai/generate.ts` (assinatura de `handleGenerateRequest`, dispatch, `binaryReferencePromptNote`)
- Test: `src/lib/ai/generate.test.ts` (os testes da Task 2 passam a valer)

**Interfaces:**
- Consumes: `callCliAgent`, `CliRunner` de `@/lib/ai/cli-agent`.
- Produces: `handleGenerateRequest(rawInput: unknown, fetchImpl?: FetchImpl, cliRunner?: CliRunner): Promise<{ change: GeneratedChange }>`.

- [ ] **Step 1: Importar o cli-agent no topo de `generate.ts`**

```ts
import { callCliAgent, type CliRunner } from "@/lib/ai/cli-agent";
```

- [ ] **Step 2: Estender a assinatura e o dispatch**

Trocar o cabeçalho:

```ts
export async function handleGenerateRequest(
  rawInput: unknown,
  fetchImpl: FetchImpl = fetch,
): Promise<{ change: GeneratedChange }> {
```

por:

```ts
export async function handleGenerateRequest(
  rawInput: unknown,
  fetchImpl: FetchImpl = fetch,
  cliRunner?: CliRunner,
): Promise<{ change: GeneratedChange }> {
```

E trocar o bloco de dispatch:

```ts
  const change =
    parsedInput.data.provider === "openai"
      ? await callOpenAI(parsedInput.data, fetchImpl)
      : await callAnthropic(parsedInput.data, fetchImpl);
```

por:

```ts
  const change = await dispatchProvider(parsedInput.data, fetchImpl, cliRunner);
```

E adicionar a função helper logo após `handleGenerateRequest`:

```ts
async function dispatchProvider(
  input: GenerateRequest,
  fetchImpl: FetchImpl,
  cliRunner?: CliRunner,
): Promise<unknown> {
  switch (input.provider) {
    case "openai":
      return callOpenAI(input, fetchImpl);
    case "anthropic":
      return callAnthropic(input, fetchImpl);
    case "claude-cli":
    case "codex-cli":
      return callCliAgent(
        {
          provider: input.provider,
          model: input.model,
          systemPrompt: SYSTEM_PROMPT,
          userPrompt: buildUserPrompt(input),
        },
        cliRunner,
      );
  }
}
```

- [ ] **Step 3: Corrigir `binaryReferencePromptNote` para o modo CLI**

No início da função `binaryReferencePromptNote(reference, provider)`, antes das checagens existentes, inserir:

```ts
  if (provider === "claude-cli" || provider === "codex-cli") {
    return "Metadata only; the CLI agent receives a text prompt and does not get this file as a block.";
  }
```

- [ ] **Step 4: Rodar os testes (incluindo os da Task 2)**

Run: `npm test -- src/lib/ai/generate.test.ts`
Expected: PASS — "aceita provider claude-cli sem apiKey" e "rejeita provider openai sem apiKey" agora passam, além dos testes originais.

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros. (O `switch` cobre os 4 casos do union, sem `default`.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/generate.ts src/lib/ai/generate.test.ts
git commit -m "feat: dispatch CLI providers through cli-agent"
```

---

### Task 5: Rota `GET /api/agents` (doctor)

Expõe quais binários existem para a UI decidir o que mostrar.

**Files:**
- Create: `src/app/api/agents/route.ts`
- Test: `src/app/api/agents/route.test.ts`

**Interfaces:**
- Consumes: `detectCliAgents` de `@/lib/ai/cli-agent`.
- Produces: `GET` handler que responde `{ claude: boolean, codex: boolean }` (status 200).

- [ ] **Step 1: Escrever o teste falhando**

```ts
// src/app/api/agents/route.test.ts
import { expect, it, vi } from "vitest";

it("GET responde com a disponibilidade dos binários", async () => {
  vi.doMock("@/lib/ai/cli-agent", () => ({
    detectCliAgents: async () => ({ claude: true, codex: false }),
  }));
  const { GET } = await import("@/app/api/agents/route");
  const response = await GET();
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ claude: true, codex: false });
  vi.resetModules();
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test -- src/app/api/agents/route.test.ts`
Expected: FAIL (módulo da rota não existe).

- [ ] **Step 3: Implementar a rota**

```ts
// src/app/api/agents/route.ts
import { NextResponse } from "next/server";

import { detectCliAgents } from "@/lib/ai/cli-agent";

export async function GET() {
  const agents = await detectCliAgents();
  return NextResponse.json(agents);
}
```

- [ ] **Step 4: Rodar o teste**

Run: `npm test -- src/app/api/agents/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/agents/route.ts src/app/api/agents/route.test.ts
git commit -m "feat: add /api/agents doctor route"
```

---

### Task 6: Persistir preferências dos novos providers

`loadProviderPreferences` hoje rejeita qualquer provider que não seja openai/anthropic. Precisa aceitar os CLI.

**Files:**
- Modify: `src/lib/storage/projects.ts` (`loadProviderPreferences`, ~linha 106) — e note que `model` pode ser vazio no modo CLI.
- Test: `src/lib/storage/projects.test.ts`

**Interfaces:**
- Produces: `loadProviderPreferences()` retorna prefs para os 4 providers; para providers CLI aceita `model` vazio.

- [ ] **Step 1: Escrever o teste falhando**

Adicionar em `src/lib/storage/projects.test.ts`:

```ts
it("carrega preferências de provider CLI com modelo vazio", () => {
  localStorage.setItem("like-figma.provider", JSON.stringify({ provider: "claude-cli", model: "" }));
  const prefs = loadProviderPreferences();
  expect(prefs).toEqual({ provider: "claude-cli", model: "" });
});
```

Garantir que `loadProviderPreferences` está importado no teste.

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test -- src/lib/storage/projects.test.ts`
Expected: FAIL (retorna `undefined` porque provider não é openai/anthropic e model é vazio).

- [ ] **Step 3: Atualizar `loadProviderPreferences`**

Substituir o corpo do `try` de `loadProviderPreferences`:

```ts
    const parsed = JSON.parse(raw) as Omit<ProviderPreferences, "apiKey">;
    if (parsed.provider !== "openai" && parsed.provider !== "anthropic") return undefined;
    if (!parsed.model) return undefined;
    return parsed;
```

por:

```ts
    const parsed = JSON.parse(raw) as Omit<ProviderPreferences, "apiKey">;
    const validProviders = ["openai", "anthropic", "claude-cli", "codex-cli"];
    if (!validProviders.includes(parsed.provider)) return undefined;
    const isCli = parsed.provider === "claude-cli" || parsed.provider === "codex-cli";
    if (!isCli && !parsed.model) return undefined;
    return { provider: parsed.provider, model: parsed.model ?? "" };
```

- [ ] **Step 4: Rodar os testes**

Run: `npm test -- src/lib/storage/projects.test.ts`
Expected: PASS (novo teste + os existentes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/projects.ts src/lib/storage/projects.test.ts
git commit -m "feat: persist CLI provider preferences"
```

---

### Task 7: UI de Configurações (workspace.tsx + globals.css)

Mostra os providers CLI quando disponíveis, esconde a API key no modo CLI e ajusta o guard de geração. Verificação por typecheck/lint/build + checklist manual (sem testes de componente — o repo não tem esse padrão para `workspace.tsx`).

**Files:**
- Modify: `src/components/workspace.tsx`
- Modify: `src/app/globals.css` (opcional — só se o segmented precisar comportar 4 itens)

**Interfaces:**
- Consumes: `GET /api/agents` → `{ claude: boolean; codex: boolean }`; `ProviderId` estendido; `handleGenerate` existente.

- [ ] **Step 1: Adicionar os modelos default dos providers CLI**

Em `src/components/workspace.tsx` linha 69, estender o `DEFAULT_MODELS`:

```ts
const DEFAULT_MODELS: Record<ProviderId, string> = {
  openai: "gpt-5-mini",
  anthropic: "claude-sonnet-4-5",
  "claude-cli": "",
  "codex-cli": "",
};
```

- [ ] **Step 2: Estado + fetch da disponibilidade dos agentes**

Perto dos outros `useState` (após a linha 88, `const [model, setModel] = ...`), adicionar:

```ts
const [cliAgents, setCliAgents] = useState<{ claude: boolean; codex: boolean }>({
  claude: false,
  codex: false,
});
```

E um efeito (junto aos outros `useEffect` do componente):

```ts
useEffect(() => {
  let active = true;
  fetch("/api/agents")
    .then((response) => (response.ok ? response.json() : { claude: false, codex: false }))
    .then((data) => {
      if (active) setCliAgents({ claude: Boolean(data.claude), codex: Boolean(data.codex) });
    })
    .catch(() => {});
  return () => {
    active = false;
  };
}, []);
```

Garantir que `useEffect` está no import de `react` (adicionar se faltar).

- [ ] **Step 3: Helper `isCliProvider`**

Logo após as declarações de estado do componente (antes das funções `handle*`), adicionar:

```ts
const isCliProvider = provider === "claude-cli" || provider === "codex-cli";
```

- [ ] **Step 4: Botões de provider CLI condicionais**

No segmented control (após o botão "Claude"/anthropic, linha ~625), adicionar:

```tsx
                    {cliAgents.claude ? (
                      <button
                        type="button"
                        className={provider === "claude-cli" ? "is-selected" : ""}
                        onClick={() => handleProviderChange("claude-cli")}
                      >
                        Claude CLI
                      </button>
                    ) : null}
                    {cliAgents.codex ? (
                      <button
                        type="button"
                        className={provider === "codex-cli" ? "is-selected" : ""}
                        onClick={() => handleProviderChange("codex-cli")}
                      >
                        Codex CLI
                      </button>
                    ) : null}
```

- [ ] **Step 5: Esconder o card de API key no modo CLI**

Envolver o `<div className="settings-card">` do campo "API key" (linha ~632) com a condição, e mostrar uma nota quando CLI:

```tsx
                {isCliProvider ? (
                  <p className="drawer-hint">Modo CLI: usa o binário local autenticado, sem API key.</p>
                ) : (
                  <div className="settings-card">
                    {/* ...conteúdo existente do card de API key... */}
                  </div>
                )}
```

E ajustar o label do modelo para indicar opcional no modo CLI (linha ~651):

```tsx
                  <label className="field-label" htmlFor="model">
                    Modelo{isCliProvider ? " (opcional)" : ""}
                  </label>
```

- [ ] **Step 6: Ajustar o guard de geração**

Em `handleGenerate` (linha ~257), trocar:

```ts
    if (!apiKey.trim()) {
      openDrawer("settings");
      setSettingsNotice("Adicione sua chave de API para criar a tela.");
      setNotice(null);
      return;
    }
```

por:

```ts
    if (!isCliProvider && !apiKey.trim()) {
      openDrawer("settings");
      setSettingsNotice("Adicione sua chave de API para criar a tela.");
      setNotice(null);
      return;
    }
```

- [ ] **Step 7: Verificar typecheck, lint e build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: sem erros. `Record<ProviderId, string>` agora exige as 4 chaves (garantido no Step 1).

- [ ] **Step 8: Checklist manual (rodar `npm run dev`)**

- Sem binários instalados: só aparecem OpenAI e Claude (HTTP). ✅
- Com `claude` no PATH: botão "Claude CLI" aparece; ao selecioná-lo o campo de API key some e a nota de CLI aparece. ✅
- Gerar uma tela com "Claude CLI" selecionado produz um `GeneratedChange` e atualiza a preview. ✅

- [ ] **Step 9: Commit**

```bash
git add src/components/workspace.tsx src/app/globals.css
git commit -m "feat: expose CLI providers in settings UI"
```

---

### Task 8: Documentação (README)

Registrar o novo modo para quem for rodar o app.

**Files:**
- Modify: `README.md` (seção "O que o app faz" e uma nova subseção)

- [ ] **Step 1: Atualizar o README**

Na lista "O que o app faz", adicionar um item:

```markdown
- Suporta tambem os binarios locais `claude` e `codex` como provedores (modo CLI), usando a autenticacao da propria CLI, sem API key.
```

E adicionar uma subseção após "Subindo com Docker Compose":

```markdown
## Modo CLI (claude / codex)

Se os binarios `claude` (Claude Code) ou `codex` (OpenAI Codex) estiverem no
PATH da maquina que roda o Next, eles aparecem como provedores em Configuracoes.
O modo CLI usa a autenticacao da propria ferramenta (sua assinatura), nao precisa
de API key e o modelo e opcional. Para apontar um caminho customizado use as
variaveis de ambiente `LIKE_FIGMA_CLAUDE_BIN` e `LIKE_FIGMA_CODEX_BIN`.

Observacao: o modo CLI recebe apenas texto no prompt; referencias de imagem/PDF
entram somente como metadado.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document CLI provider mode"
```

---

## Self-Review

**Spec coverage:**
- `cli-agent.ts` core → Task 3. ✅
- `ProviderId` + schema condicional → Task 2. ✅
- Dispatch em `handleGenerateRequest` → Task 4. ✅
- `/api/agents` doctor → Task 5. ✅
- UI (workspace + css) → Task 7. ✅
- Preferências → Task 6. ✅
- Segurança (bin fixo, sem shell, stdin, tempdir, timeout) → Task 3 (Global Constraints). ✅
- Erros (ENOENT/exit/timeout/JSON inválido) → Task 3. ✅
- Limitação v1 (imagem/PDF só metadado) → Task 4 (`binaryReferencePromptNote`) + README Task 8. ✅
- Testes cli-agent + generate dispatch → Tasks 3, 4. ✅
- Evitar import circular (errors.ts) → Task 1. ✅

**Placeholder scan:** sem TBD/TODO; todo passo de código tem código completo. ✅

**Type consistency:** `CliRunner`, `CliAgentInput`, `callCliAgent`, `detectCliAgents`, `isBinaryAvailable`, `handleGenerateRequest(raw, fetch, cliRunner)` usados de forma idêntica entre as tasks 3/4/5. `ProviderId` de 4 membros consistente em types/schema/DEFAULT_MODELS/prefs. ✅
