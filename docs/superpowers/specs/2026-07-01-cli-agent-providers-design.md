# CLI agent providers (`claude-cli` / `codex-cli`)

**Data:** 2026-07-01
**Status:** aprovado para planejamento

## Objetivo

Permitir que o like-figma gere interfaces usando os binários locais `claude`
(Claude Code CLI) e `codex` (OpenAI Codex CLI) como "providers", além dos
providers HTTP BYOK já existentes (`openai`, `anthropic`). Espelha o approach do
projeto `jobrabbit`, que spawna o binário local em vez de chamar a API HTTP —
mas mantendo o modelo de dados atual do like-figma.

## Princípio central

Os providers CLI se encaixam no **mesmo contrato** dos providers HTTP: recebem
prompt + arquivos + referências e devolvem um `GeneratedChange` JSON. Todo o
pipeline a jusante (`applyGeneratedChange` → preview WebContainer → export ZIP)
permanece inalterado. A única diferença é o transporte: `execFile` de um binário
local em modo não-interativo no lugar de `fetch` para a API.

## Decisões travadas (via brainstorming)

1. **Binários suportados:** `claude` e `codex` (ambos).
2. **Modelo de saída:** o CLI devolve o mesmo `GeneratedChange` JSON — reusa o
   pipeline existente. Não editamos arquivos em disco.
3. **Auth/modelo:** modo CLI usa a auth própria do binário (assinatura já logada
   na máquina). Sem campo de API key. Campo de modelo é opcional (`--model` só é
   passado se preenchido).

## Componentes

### `src/lib/ai/cli-agent.ts` (novo)

Coração da feature.

- `callCliAgent(input, { runner })` — `runner` é injetável (default = wrapper de
  `node:child_process.execFile`), espelhando o padrão `fetchImpl` de
  `generate.ts`, tornando a função testável sem spawnar processos reais.
- Monta o prompt reusando `buildUserPrompt(input)` + `SYSTEM_PROMPT` de
  `generate.ts` (ambos serão exportados), acrescentando a instrução: "responda
  com APENAS o JSON do GeneratedChange, sem markdown".
- **Claude:** `claude -p --output-format json [--model <model>]`, prompt via
  **stdin** (não argv). Parseia o envelope JSON do Claude, extrai `.result`, e
  roda o `parseJsonText` existente para obter o `GeneratedChange`.
- **Codex:** `codex exec --json [--model <model>]`, prompt via **stdin**.
  Parseia a última mensagem do agente na stream JSON e extrai o JSON embutido.
- **Segurança:**
  - Nome do binário é **fixo** (`claude`/`codex`), overridável apenas por env
    (`LIKE_FIGMA_CLAUDE_BIN` / `LIKE_FIGMA_CODEX_BIN`).
  - `execFile` **sem shell** (evita injeção de comando).
  - Prompt entra por **stdin**, nunca por argv (evita limite de tamanho e
    injeção de flags).
  - cwd = **tempdir vazio** (o agente só precisa de texto in/out; não deve
    vasculhar o filesystem do host).
  - `timeout` (~120s) e `maxBuffer` configurados.

### `src/lib/ai/generate.ts` (alterado)

- `ProviderId` → `"openai" | "anthropic" | "claude-cli" | "codex-cli"`
  (definido em `src/lib/project/types.ts`).
- `apiKey` vira condicional no schema Zod: obrigatória para providers HTTP,
  ignorada/opcional para providers CLI.
- `handleGenerateRequest`: o dispatch ganha os dois casos CLI → `callCliAgent`.
  Toda a validação de arquivos/paths/schema/referências permanece igual.
- Exportar `SYSTEM_PROMPT` e `buildUserPrompt` (hoje privados) para reuso.

### `src/app/api/generate/route.ts`

Sem mudança — já delega tudo para `handleGenerateRequest`.

### `src/app/api/agents/route.ts` (novo, GET)

"Doctor"/preflight: roda `which claude` / `which codex` e devolve
`{ claude: boolean, codex: boolean }`. A UI só oferece um provider CLI se o
respectivo binário existir. Espelha `src/core/doctor.rs` do jobrabbit.

### `src/components/workspace.tsx` + `src/app/globals.css` (alterado)

- Segmented control de provider ganha "Claude CLI" e "Codex CLI", exibidos
  apenas se `/api/agents` reportar o binário como disponível.
- Com provider CLI ativo: campo de API key some (texto: "usa a CLI local, sem
  chave"); campo de modelo fica opcional.
- `loadProviderPreferences` / `persistProviderPreferences` aceitam os novos IDs.

## Fluxo de dados

```
workspace
  └─ POST /api/generate { provider:"claude-cli", model?, prompt, files, references, generationSkill }
       └─ handleGenerateRequest
            └─ callCliAgent
                 └─ execFile('claude', ['-p','--output-format','json'], { stdin: prompt, cwd: tmp })
                      └─ parse envelope → .result → parseJsonText
                           └─ GeneratedChangeSchema.safeParse
                                └─ applyGeneratedChange → { change }
  └─ cliente aplica o change (idêntico ao fluxo HTTP atual)
```

## Tratamento de erros

- Binário ausente (`ENOENT`) → `ProviderRequestError` "claude não encontrado no
  PATH" (status 502).
- Exit code ≠ 0 → `ProviderRequestError` com mensagem + cauda do stderr.
- Timeout → `ProviderRequestError` "geração excedeu o tempo limite".
- Saída não-JSON / change inválido → reusa o `ProviderRequestError` de
  "invalid change" já existente.

## Limitação assumida (v1, YAGNI)

Referências de **texto** entram no prompt normalmente. Imagens/PDF entram
**apenas como metadado** — `claude -p` / `codex exec` são text-in/text-out.
Mesma degradação graciosa que o código já aplica hoje para tipos não suportados.

## Testes

`src/lib/ai/cli-agent.test.ts` (novo) com `runner` fake:

1. Parseia envelope JSON do Claude e retorna o `GeneratedChange`.
2. Parseia saída JSON do Codex e retorna o `GeneratedChange`.
3. `ENOENT` → erro amigável de binário não encontrado.
4. Saída não-JSON → `ProviderRequestError`.
5. Exit code ≠ 0 → `ProviderRequestError` com stderr.

Estender `src/lib/ai/generate.test.ts`:

- Dispatch roteia `claude-cli`/`codex-cli` para `callCliAgent`.
- `apiKey` opcional quando provider é CLI; obrigatória quando HTTP.

E2E (Playwright) fica **fora de escopo** — depende de binário real na máquina,
não disponível em CI.

## Fora de escopo

- Edição direta de arquivos em disco pelo CLI.
- Streaming de tokens para a UI (a geração continua request/response único).
- Multimodal (imagem/PDF) via CLI.
- Injeção de API key via env para o subprocesso.
