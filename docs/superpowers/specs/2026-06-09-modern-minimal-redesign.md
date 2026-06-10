# Modern Minimal Redesign Spec

## Goal

Redesign the existing workspace with a modern, minimal Apple/Linear-inspired
visual direction while preserving the current product behavior and information
architecture.

## Approved Direction

The UI should feel bright, calm, premium, and highly utilitarian. The app remains
a creation console: chat on the left, live preview as the dominant surface, and
drawers for projects, settings, and files.

## Visual Principles

- Use an almost-white background with subtle depth instead of visible grid noise.
- Reduce visual weight: fewer heavy borders, softer shadows, lighter surfaces.
- Keep typography compact and refined, with strong hierarchy but no oversized
  marketing treatment.
- Use restrained accent color only for active, primary, or success states.
- Keep controls familiar and stable: icon + text commands, compact inputs, clear
  drawer actions.
- Preserve accessibility labels, keyboard focus states, and existing layout
  landmarks.

## Scope

In scope:

- Global color tokens, shadows, spacing, and surface treatment.
- Topbar refinement.
- Chat panel and prompt form refinement.
- Preview panel framing refinement.
- Drawer, project, file, reference, and settings styling refinement.
- Responsive polish for tablet/mobile breakpoints.

Out of scope:

- Generation behavior.
- Storage, project migration, skill loading, reference processing, WebContainer,
  export, or provider APIs.
- New navigation concepts.
- New dependencies.

## Success Criteria

- The app reads as cleaner and more premium without reducing utility.
- Preview remains the dominant workspace surface.
- Existing E2E workflow still passes without behavior rewrites.
- Text and controls do not overlap at desktop or mobile breakpoints.
- No one-note purple/blue gradient or decorative blob treatment.
