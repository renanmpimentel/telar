# SDD Progress — CLI Agent Providers

Plan: docs/superpowers/plans/2026-07-01-cli-agent-providers.md
Branch: feat/cli-agent-providers
Base commit (branch start): 6d1817c

## Tasks
- Task 1: complete (commits 6d1817c..03d9e70, review clean)
- Task 2+4 (merged): complete (commits 823dc92..c807405, review clean after fix)
- Task 3: complete (commits 03d9e70..823dc92, review clean)
- Task 5: complete (commits c807405..15b394b, review clean)
- Task 6: complete (commits 15b394b..32e9ba7, review clean after test-gap fix)
- Task 7: complete (UI). Hygiene issue RESOLVED: branch recomposed so the UI commit's
  globals.css contains only `.drawer-hint`; the pre-existing `.fullscreen-preview-*` CSS
  is back in the working tree uncommitted (original session-start state).
- Task 8: complete (docs).

## Final whole-branch review
- Run on opus. One actionable finding (codex-cli dispatch test used non-JSONL stdout) →
  fixed in commit 35af0b4. Other findings adjudicated:
  - isBinaryAvailable "returns undefined" → FALSE POSITIVE (`target = override ?? bin` exists).
  - --model untested → REDUNDANT (covered in cli-agent.test.ts).
  - regex/retry/Zod-prefs/stderr-truncation/JSDoc → YAGNI / pre-existing pattern / optional.
  - /api/agents try/catch → won't-fix low priority (detectCliAgents never rejects).
- Final state: 57 tests pass, typecheck clean, lint clean, prod build OK.
- Final branch commits: 03d9e70, 823dc92, 827d733, c807405, 15b394b, 412c493, 32e9ba7,
  <ui>, <docs>, 35af0b4 (hashes after recompose differ for UI/docs).

## Execution notes
- Exec order adjusted: Task 3 (cli-agent) runs before Tasks 2+4, which are merged
  into one task (schema + dispatch) so it is independently testable via injected runner.

## Minor findings (for final review)
- Task 2+4: `binaryReferencePromptNote` CLI branch has no direct unit test (would
  require exporting the internal fn). Low risk (3-line early return). Final review to judge.
- Task 5: `/api/agents` route has no try/catch (detectCliAgents swallows errors internally,
  so it won't reject in practice). Low risk. Final review to judge.
