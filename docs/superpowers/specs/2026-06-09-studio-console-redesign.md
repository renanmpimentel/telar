# Studio Console Redesign

## Goal

Improve the MVP host UI so it reads as a serious AI interface builder instead of a scaffold.

## Approved Direction

Use a Studio Console aesthetic: dark, dense, professional, with preview as the dominant surface, chat as the command stream, and files/editor as a technical secondary panel. Avoid generic beige cards and equal-weight panels.

## Scope

- Keep existing product behavior intact.
- Change only host workspace presentation and related E2E expectations.
- Preserve WebContainer preview, provider selection, BYOK input, local persistence, file editing, and ZIP export.
- Keep controls accessible and readable on desktop and mobile.

## Visual System

- Background: near-black graphite with subtle grid/scan texture.
- Panels: dark glass/metal surfaces with crisp borders, not floating decorative cards.
- Accent: electric green for ready/generate states, coral for errors, blue/cyan for preview/file activity.
- Typography: compact, professional, with stronger contrast and better hierarchy.
- Layout: preview remains the visual anchor; chat/config and files/editor support it without competing.

## Acceptance

- Main shell exposes a recognizable Studio Console composition.
- Preview area is visually dominant and framed like a live canvas.
- Chat and provider controls are compact and purposeful.
- File tree/editor look like an IDE surface.
- Existing generation, error preservation, and ZIP export E2E flow still passes.
