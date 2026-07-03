# Task 2+4 (merged): Estender ProviderId + schema e ligar o dispatch CLI

Mesclamos as Tasks 2 (tipo/schema) e 4 (dispatch) do plano porque o comportamento do schema só é observável quando o dispatch existe — juntas ficam independentemente testáveis de ponta a ponta usando o `runner` injetável do cli-agent (Task 3, já pronto).

## Global Constraints
- Next.js 16 / React 19 / TypeScript. Zod para validação.
- Providers CLI (`claude-cli`, `codex-cli`) NÃO usam API key; modelo é opcional.
- Referências de imagem/PDF entram apenas como metadado no modo CLI.
- TDD: teste falhando → implementação mínima → teste passando → commit.
- Comandos: `npm test`, `npm run typecheck`, `npm run lint`.

## Files
- Modify: `src/lib/project/types.ts:3` (ProviderId)
- Modify: `src/lib/ai/generate.ts` (schema, assinatura de handleGenerateRequest, dispatch, binaryReferencePromptNote)
- Test: `src/lib/ai/generate.test.ts`

## Interfaces
- Consumes: `callCliAgent`, `CliRunner` de `@/lib/ai/cli-agent` (já existem). `SYSTEM_PROMPT` e `buildUserPrompt` são funções/const internas de `generate.ts` (já existem no arquivo).
- Produces:
  - `ProviderId = "openai" | "anthropic" | "claude-cli" | "codex-cli"`.
  - `GenerateRequestSchema` aceita os 4 providers; exige `apiKey` e `model` não-vazios apenas para `openai`/`anthropic`.
  - `handleGenerateRequest(rawInput: unknown, fetchImpl?: FetchImpl, cliRunner?: CliRunner): Promise<{ change: GeneratedChange }>`.

## Steps

### Step 1: Escrever os testes falhando
Adicionar em `src/lib/ai/generate.test.ts`. Reusar o helper/objeto de request válido já existente no arquivo se houver; senão, construir inline com `files: { "package.json": "{}" }`. Garantir que `GenerateRequestError` está importado no topo do teste.
```ts
it("aceita provider claude-cli sem apiKey e roteia pelo cli runner", async () => {
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

### Step 2: Rodar para ver falhar
Run: `npm test -- src/lib/ai/generate.test.ts`
Expected: FAIL (schema só conhece openai/anthropic; handleGenerateRequest ainda não aceita 3º argumento nem roteia CLI).

### Step 3: Estender `ProviderId`
Em `src/lib/project/types.ts` linha 3:
```ts
export type ProviderId = "openai" | "anthropic" | "claude-cli" | "codex-cli";
```

### Step 4: Importar cli-agent no topo de `generate.ts`
```ts
import { callCliAgent, type CliRunner } from "@/lib/ai/cli-agent";
```

### Step 5: Atualizar o schema em `generate.ts`
Substituir as três linhas dentro de `GenerateRequestSchema`:
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
E envolver o `z.object({...})` com um refine ao final da definição (após a chave `}` que fecha o objeto, antes do `;`):
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
Observação: `type GenerateRequest = z.infer<typeof GenerateRequestSchema>` deve continuar válido com o `superRefine` (ZodEffects). `callOpenAI`/`callAnthropic` continuam usando `input.apiKey`/`input.model`, agora garantidos não-vazios para HTTP.

### Step 6: Estender a assinatura e o dispatch de `handleGenerateRequest`
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
Trocar o bloco de dispatch:
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

### Step 7: Corrigir `binaryReferencePromptNote` para o modo CLI
No início da função `binaryReferencePromptNote(reference, provider)`, antes das checagens existentes, inserir:
```ts
  if (provider === "claude-cli" || provider === "codex-cli") {
    return "Metadata only; the CLI agent receives a text prompt and does not get this file as a block.";
  }
```

### Step 8: Rodar os testes
Run: `npm test -- src/lib/ai/generate.test.ts`
Expected: PASS — os dois novos testes passam, além dos originais.

### Step 9: Typecheck + lint
Run: `npm run typecheck && npm run lint`
Expected: sem erros. O `switch` cobre os 4 casos do union sem `default` (garante exaustividade).

### Step 10: Commit
```bash
git add src/lib/project/types.ts src/lib/ai/generate.ts src/lib/ai/generate.test.ts
git commit -m "feat: extend schema and dispatch CLI providers"
```
