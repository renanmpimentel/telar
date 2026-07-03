# Task 6: Persistir preferências dos providers CLI

`loadProviderPreferences` hoje rejeita qualquer provider que não seja openai/anthropic e exige `model` não-vazio. Precisa aceitar os providers CLI (com modelo possivelmente vazio).

## Global Constraints
- TypeScript. Vitest. `fake-indexeddb` já configurado nos testes de storage.
- TDD: teste falhando → implementação → teste passando → commit.

## Files
- Modify: `src/lib/storage/projects.ts` (função `loadProviderPreferences`, ~linha 100-113)
- Test: `src/lib/storage/projects.test.ts`

## Interfaces
- Produces: `loadProviderPreferences()` retorna prefs para os 4 providers; para providers CLI aceita `model` vazio (`""`).

## Steps

### Step 1: Escrever o teste falhando
Adicionar em `src/lib/storage/projects.test.ts` (garantir que `loadProviderPreferences` está importado):
```ts
it("carrega preferências de provider CLI com modelo vazio", () => {
  localStorage.setItem("like-figma.provider", JSON.stringify({ provider: "claude-cli", model: "" }));
  const prefs = loadProviderPreferences();
  expect(prefs).toEqual({ provider: "claude-cli", model: "" });
});
```
Se os testes desse arquivo limpam o localStorage entre casos (beforeEach/afterEach), siga o mesmo padrão para não vazar estado.

### Step 2: Rodar para ver falhar
Run: `npm test -- src/lib/storage/projects.test.ts`
Expected: FAIL (retorna `undefined` — provider não é openai/anthropic e model é vazio).

### Step 3: Atualizar `loadProviderPreferences`
No corpo do `try` de `loadProviderPreferences`, substituir:
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

### Step 4: Rodar os testes
Run: `npm test -- src/lib/storage/projects.test.ts`
Expected: PASS (novo teste + os existentes — confirme que os casos openai/anthropic anteriores continuam válidos).

### Step 5: Commit
```bash
git add src/lib/storage/projects.ts src/lib/storage/projects.test.ts
git commit -m "feat: persist CLI provider preferences"
```
