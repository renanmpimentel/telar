# Task 1: Extrair classes de erro para `errors.ts`

Refactor puro que quebra o futuro ciclo de import entre `generate.ts` e `cli-agent.ts`. Sem mudança de comportamento.

## Global Constraints (aplicam a todas as tasks)
- Projeto permanece Next.js 16 / React 19 / TypeScript.
- Todo passo de código segue TDD: teste falhando → implementação mínima → teste passando → commit.
- Comandos: `npm test` (vitest), `npm run typecheck`, `npm run lint`.

## Files
- Create: `src/lib/ai/errors.ts`
- Modify: `src/lib/ai/generate.ts` (remove as duas classes, importa e re-exporta de `errors.ts`)

## Interfaces
- Produces: `GenerateRequestError` (`constructor(message: string, status = 400)`, campo `status: number`) e `ProviderRequestError` (`constructor(message: string, status = 502)`, campo `status: number`), exportadas de `src/lib/ai/errors.ts` e re-exportadas de `src/lib/ai/generate.ts`.

## Steps

### Step 1: Criar `errors.ts`
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

### Step 2: Remover as classes de `generate.ts` e importar de `errors.ts`
Em `src/lib/ai/generate.ts`, apagar os dois blocos `export class GenerateRequestError {...}` e `export class ProviderRequestError {...}` (linhas ~22-40). Adicionar no topo, junto aos outros imports:
```ts
import { GenerateRequestError, ProviderRequestError } from "@/lib/ai/errors";
```
E logo abaixo dos imports, re-exportar para não quebrar `route.ts`:
```ts
export { GenerateRequestError, ProviderRequestError };
```
Nota: `route.ts` e os testes importam essas classes de `@/lib/ai/generate` — a re-exportação preserva isso.

### Step 3: Rodar a suíte para garantir que nada quebrou
Run: `npm test -- src/lib/ai/generate.test.ts`
Expected: PASS (mesmos testes de antes).

### Step 4: Typecheck
Run: `npm run typecheck`
Expected: sem erros.

### Step 5: Commit
```bash
git add src/lib/ai/errors.ts src/lib/ai/generate.ts
git commit -m "refactor: extract AI error classes into errors.ts"
```
