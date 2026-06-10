# Modern Minimal Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the workspace UI with a modern minimal Apple/Linear-inspired design without changing app behavior.

**Architecture:** Keep the React component structure mostly intact and implement the redesign through scoped CSS token and selector updates. Only make tiny markup/class adjustments in `src/components/workspace.tsx` if CSS alone cannot express the intended hierarchy.

**Tech Stack:** Next.js, React, TypeScript, CSS in `src/app/globals.css`, Playwright for E2E verification.

---

## Chunk 1: Visual System And Layout Polish

### Task 1: Update Global Visual Tokens

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Update root tokens**

Replace the current gray grid-heavy theme with near-white surfaces, neutral text,
subtle border tokens, restrained blue/green accent tokens, and softer shadows.

- [ ] **Step 2: Remove visible grid background**

Change `body` background to a clean off-white radial/linear surface with no
obvious square grid.

- [ ] **Step 3: Verify CSS compiles**

Run: `npm run lint`
Expected: no ESLint errors.

### Task 2: Refine Shell, Topbar, And Panels

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Reduce topbar weight**

Make the topbar lower, lighter, and less card-like while keeping all controls in
place.

- [ ] **Step 2: Refine workspace panels**

Make chat and preview panels cleaner with softer borders, minimal shadows, and
more precise spacing.

- [ ] **Step 3: Keep responsive layout stable**

Check existing `@media` blocks and keep mobile layout readable.

### Task 3: Refine Chat, Prompt, Drawers, And File UI

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Polish chat messages and empty state**

Use quieter message surfaces, less visual noise, and refined spacing.

- [ ] **Step 2: Polish prompt form and buttons**

Make primary and secondary actions compact, crisp, and consistent.

- [ ] **Step 3: Polish drawers and nested file/reference UI**

Keep drawers utilitarian but lighter: subtle section boundaries, clear active
states, and no nested-card heaviness.

- [ ] **Step 4: Run focused browser verification**

Run: `npm run test:e2e`
Expected: the workspace flow passes.

## Chunk 2: Final Verification

### Task 4: Full Verification Gate

**Files:**
- No code changes expected.

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: pass.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: pass.

- [ ] **Step 3: Run unit tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Run production build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 5: Run E2E tests**

Run: `npm run test:e2e`
Expected: pass.
