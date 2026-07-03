# Task 6 Report: Persist CLI Provider Preferences

## Status
COMPLETED

## Modified Files
- `src/lib/storage/projects.ts` (function `loadProviderPreferences`, lines 104-111)
- `src/lib/storage/projects.test.ts` (added import + test case)

## Implementation Summary
Updated `loadProviderPreferences()` to:
- Accept `claude-cli` and `codex-cli` providers in addition to `openai`/`anthropic`
- Allow empty models (`""`) for CLI providers while enforcing non-empty models for `openai`/`anthropic`
- Preserve the type signature: returns `Omit<ProviderPreferences, "apiKey">` or `undefined`

### Logic Change
```typescript
// OLD: rejects non-openai/anthropic + requires non-empty model
if (parsed.provider !== "openai" && parsed.provider !== "anthropic") return undefined;
if (!parsed.model) return undefined;

// NEW: accepts CLI providers with optional model
const validProviders = ["openai", "anthropic", "claude-cli", "codex-cli"];
if (!validProviders.includes(parsed.provider)) return undefined;
const isCli = parsed.provider === "claude-cli" || parsed.provider === "codex-cli";
if (!isCli && !parsed.model) return undefined;
return { provider: parsed.provider, model: parsed.model ?? "" };
```

## Test Results
```bash
$ npm test -- src/lib/storage/projects.test.ts

Test Files  1 passed (1)
     Tests  7 passed (7)  ✓ (includes new test: "carrega preferências de provider CLI com modelo vazio")
```

## TypeCheck Results
```bash
$ npx tsc --noEmit
TypeScript: No errors found
```

## Commit
- Hash: `412c493` (short) / `412c49348e0ac76e1ce26ef37885c2f81b81aa10` (full)
- Message: `feat: persist CLI provider preferences`

## Test Summary
Single line: All 7 tests pass including new CLI provider preference test with empty model.

## Concerns
None. Implementation follows TDD as specified:
1. Test written to fail (before implementation)
2. Implementation completed per brief specification
3. All tests pass including existing openai/anthropic cases (backward compatibility verified)
4. TypeScript validation clean

---

## Regression Test Report (Fix)

### Change Applied
Added 2 regression tests in `src/lib/storage/projects.test.ts`:
```typescript
it("rejeita openai com model vazio", () => {
  localStorage.setItem("like-figma.provider", JSON.stringify({ provider: "openai", model: "" }));
  expect(loadProviderPreferences()).toBeUndefined();
});

it("rejeita anthropic com model vazio", () => {
  localStorage.setItem("like-figma.provider", JSON.stringify({ provider: "anthropic", model: "" }));
  expect(loadProviderPreferences()).toBeUndefined();
});
```

### Test Execution
```
Test Files  1 passed (1)
     Tests  9 passed (9)
   Start at  18:32:08
   Duration  550ms
```

### Commit
- Hash: `32e9ba7`
- Message: `test: guard HTTP providers reject empty model`

### Summary
9 tests passed (previously 7, +2 new regression tests)

### Concerns
None. Tests follow existing pattern, validation logic already implemented.
