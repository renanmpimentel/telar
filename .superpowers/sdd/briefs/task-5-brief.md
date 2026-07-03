# Task 5: Rota `GET /api/agents` (doctor)

Expõe quais binários CLI existem na máquina para a UI decidir o que mostrar.

## Global Constraints
- Next.js 16 App Router. TypeScript. Vitest.
- TDD: teste falhando → implementação → teste passando → commit.

## Files
- Create: `src/app/api/agents/route.ts`
- Test: `src/app/api/agents/route.test.ts`

## Interfaces
- Consumes: `detectCliAgents` de `@/lib/ai/cli-agent` (já existe; assinatura `detectCliAgents(env?, accessFn?): Promise<{ claude: boolean; codex: boolean }>`).
- Produces: `GET` handler que responde `{ claude: boolean, codex: boolean }` (status 200).

## Steps

### Step 1: Escrever o teste falhando
Criar `src/app/api/agents/route.test.ts`. Padrão: mockar o módulo cli-agent e importar a rota dinamicamente após o mock.
```ts
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
Nota: se o padrão de teste de rota existente no repo (`src/app/api/skills/github/route.test.ts`) usar outra convenção de mock, siga-a por consistência, desde que o teste continue verificando status 200 e o corpo `{ claude: true, codex: false }`.

### Step 2: Rodar para ver falhar
Run: `npm test -- src/app/api/agents/route.test.ts`
Expected: FAIL (módulo da rota não existe).

### Step 3: Implementar a rota
```ts
// src/app/api/agents/route.ts
import { NextResponse } from "next/server";

import { detectCliAgents } from "@/lib/ai/cli-agent";

export async function GET() {
  const agents = await detectCliAgents();
  return NextResponse.json(agents);
}
```

### Step 4: Rodar o teste
Run: `npm test -- src/app/api/agents/route.test.ts`
Expected: PASS.

### Step 5: Typecheck + lint
Run: `npm run typecheck && npm run lint`
Expected: sem erros.

### Step 6: Commit
```bash
git add src/app/api/agents/route.ts src/app/api/agents/route.test.ts
git commit -m "feat: add /api/agents doctor route"
```
