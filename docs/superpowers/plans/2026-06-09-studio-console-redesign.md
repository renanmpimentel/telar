# Studio Console Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current scaffold-like UI with an approved Studio Console workspace while preserving behavior.

**Architecture:** Keep business logic unchanged. Update the existing React component structure with semantic wrappers and status text, then replace the CSS visual system with a dark professional workspace.

**Tech Stack:** Next.js, React, Tailwind CSS entrypoint with custom CSS, lucide-react, Playwright.

---

### Task 1: E2E Red Test

**Files:**
- Modify: `tests/e2e/workspace.spec.ts`

- [ ] Add expectations for `Studio Console`, `Command stream`, and `Live canvas`.
- [ ] Run `npm run test:e2e` and verify it fails before implementation.

### Task 2: Workspace Markup

**Files:**
- Modify: `src/components/workspace.tsx`
- Modify: `src/components/preview-pane.tsx`

- [ ] Add a top-level workspace header with `Studio Console`.
- [ ] Rename major visible section labels to `Command stream`, `Live canvas`, and `Project files`.
- [ ] Add compact metadata/status affordances without changing behavior.

### Task 3: Visual System

**Files:**
- Modify: `src/app/globals.css`

- [ ] Replace the beige palette with dark graphite tokens.
- [ ] Make preview dominant through grid sizing, canvas treatment, and status chrome.
- [ ] Restyle chat, provider controls, project rail, file tree, editor, and mobile layout.
- [ ] Keep button/text dimensions stable and avoid text overflow.

### Task 4: Verification

**Files:**
- No source changes expected.

- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run test:e2e`.
- [ ] Run `npm audit --omit=dev`.
- [ ] Run the secret-pattern scan.
- [ ] Rebuild and restart Docker with `docker compose up -d --build`.
- [ ] Verify `curl -I http://127.0.0.1:3000` returns `200 OK` and COOP/COEP headers.
