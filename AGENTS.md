# AGENTS.md

Practical playbook for coding agents working in `obsxa`.

## Quick Commands

All commands are verified from `package.json` and CI workflows.

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm lint:fix
pnpm typecheck
pnpm test
pnpm test:run
pnpm generate
```

Single-test examples (verified):

```bash
pnpm test:run test/observation-parse.test.ts
pnpm test:run test/backup-command.test.ts
```

## Codebase Map

- `src/cli.ts`: CLI entrypoint and subcommand routing via dynamic imports.
- `src/index.ts`: `createObsxa` bootstrap (meta table, schema version check, migrations, FTS setup, store composition).
- `src/core/*`: domain/data layer (`create*Store` factories for project/observation/relation/cluster/dedup/analysis/search).
- `src/commands/*`: citty command handlers; thin wrappers around stores with argument coercion and output formatting.
- `src/ai.ts`: AI SDK tools (`tool(...)` + zod discriminated unions around `operation`).
- `drizzle/*`: migration artifacts and drizzle metadata. Use as generated source of truth for schema evolution.
- `test/*`: mostly integration tests with temp SQLite isolation; parser/CLI validation tests are also present.
- `.github/workflows/test.yml`: CI gate order is lint -> typecheck -> build -> test:run.

Subdirectory playbooks already exist and should be treated as local overrides:

- `src/core/AGENTS.md`
- `src/commands/AGENTS.md`
- `test/AGENTS.md`

## Code Conventions

- ESM-only TypeScript (`package.json` has `"type": "module"`). Do not introduce CommonJS.
- Keep imports explicit and extension-aware (`./file.ts` style). Use `import type` for type-only imports.
- Match existing naming: `create*Store` factory pattern in `src/core`, domain-oriented command modules in `src/commands`.
- CLI pattern: validate early, emit `consola.error(...)`, then `process.exit(1)` for invalid user input.
- Keep `--json` and `--toon` output parity for command paths that return structured data.
- Prefer explicit thrown errors in core domain logic (`throw new Error(...)`) over silent failure.
- Keep percent-like fields in `0..100` and dedup threshold logic in `0..1` domain.
- Never use `as any`, `@ts-ignore`, or `@ts-expect-error`.
- Schema changes must go through Drizzle migrations (`pnpm generate`), not ad-hoc SQL edits in runtime code.

## Execution Workflow

1. Explore first: find similar implementation in target module and nearest tests.
2. Plan the smallest diff that fits existing boundaries (`src/core` vs `src/commands` vs `src/ai.ts`).
3. Edit surgically; keep behavior and output shape compatibility.
4. Verify with diagnostics and commands relevant to changed files.
5. Re-check docs/tests when command surface or schema behavior changes.

Default verification sequence after non-trivial edits:

```bash
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
```

When touching one area, start with focused tests first, then full suite.

## Memory Workflow

- Before answering questions about past decisions or prior sessions, run memory search first.
- Reuse prior habits only when they still match current code; repository state wins on conflicts.
- Log durable learnings in the right memory bucket (not in random scratch notes).
- If writing dated memory notes, use the event date, not the write date.

## Safety and Git Hygiene

- Do not run destructive git operations (`reset --hard`, checkout file reverts) unless explicitly requested.
- Do not commit or push unless explicitly requested.
- Do not leak secrets or local credentials in output, logs, docs, or snapshots.
- Treat `dist/` and `drizzle/meta/` as generated artifacts; do not hand-edit them.
- Local runtime DB files (`obsxa.db*`) may exist; do not assume they are disposable without confirmation.

## Communication Style

- Keep responses concise, direct, and technical.
- Explain why when making non-obvious changes or tradeoffs.
- Prefer concrete commands and file paths over abstract guidance.
- Avoid template filler; report uncertainty explicitly and include a way to verify.

<!-- skilld -->

Before modifying code, evaluate each installed skill against the current task.
For each skill, determine YES/NO relevance and invoke all YES skills before proceeding.

<!-- /skilld -->
