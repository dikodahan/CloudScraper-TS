# AGENTS.md — cloudscraper-ts

Cursor / Codex counterpart to local `CLAUDE.md`. Same rules apply.

## What this is

TypeScript rewrite of [codemanki/cloudscraper](https://github.com/codemanki/cloudscraper). Published from Git (`github:dikodahan/CloudScraper-TS#<ref>`), never npm. `prepare` builds `dist/`.

Shipped version: **2.0.0**. Rebuild plan: `.claude/v2-rebuild-plan.md` (complete).

## Before v2 / rebuild / modernization

Read the plan first. Applies when the user says “start the implementation”, “start phase N”, “continue the rebuild”, “do the v2 work”, or changes transport, orchestrate solvers, challenge detection, or `browsers.json`.

- Phases: 0 → 1 → 2 → {3, 4} → 5 → 6. Only 3 and 4 may run together.
- One phase per turn unless the user names more than one.
- Phase 2 is part of the v2 line (no standalone `1.1.1` patch).
- Do not add `impit` or `patchright` before Phase 3 / Phase 4.

## Commands

```bash
pnpm build             # tsc --build → dist/
pnpm clean             # tsc --build --clean
pnpm test              # fixture detect tests + live target matrix
pnpm test:server       # browser harness on :8765
pnpm test:once         # one-shot CLI against a live URL
pnpm lint              # eslint .
pnpm prettier          # prettier --write .
```

## Conventions

- Prettier: 4-space indent, double quotes, semicolons, `arrowParens: always`, `printWidth: 10000` (do not hand-wrap).
- TypeScript: `strict: true`, `noImplicitAny: false`, `module: CommonJS`, `declaration: true`.
- Optional deps: runtime `import(id)` in try/catch; package must work with none installed.
- Public API: default export `request` plus named exports from `src/index.ts`.
- Do not renumber `errorType` in `src/errors.ts`. Rebuild `dist/` after `src/` changes.
