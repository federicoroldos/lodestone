# Project State

> Always-current snapshot of where the project is. Updated by GSD workflows;
> humans can edit freely.

## Project

Lodestone - a self-hosted web panel for managing Minecraft servers on
Windows. See `../CLAUDE.md` for the full project brief.

## Active milestone

Friendlier Panel for Non-Tech Operators (see `../ROADMAP.md`).

## Current focus

Phase 1 - Friendly Configs tab. Planned, ready for execution.

## Accumulated context

### Decisions

- **English-only UI.** Hard rule from `../CLAUDE.md`. New strings go in
  `i18n.json` under `en.dictionaries.en.configs.*`. Do not add new Spanish
  strings (the existing `es` block is pre-existing legacy content).
- **No new heavy deps for Phase 1.** Prism/highlight.js, line-diff libraries,
  and form libraries are out of scope. Use shadcn/ui + Tailwind + a small
  in-repo line-diff helper. Prism is fine for Phase 2 if we add it.
- **`.bak` restore must be reversible.** Restoring a `.bak` should itself
  create a fresh `.bak` of the current state so the user can undo the undo.

### Roadmap evolution

- 2026-06-27: Milestone "Friendlier Panel for Non-Tech Operators" created
  with Phase 1 (Friendly Configs tab). Scope decided via gsd-explore;
  details in `.planning/notes/friendlier-configs-tab.md`.

### Open questions

See "Open questions" in `.planning/notes/friendlier-configs-tab.md`.
