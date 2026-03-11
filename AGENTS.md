# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-11T22:28:42+01:00
**Commit:** aaea389
**Branch:** main

## OVERVIEW

obsxa is an ESM-only TypeScript library + CLI for structured observation tracking (project, observation, relation, cluster, dedup, analysis).
Core data logic lives in `src/core`, CLI orchestration in `src/commands`, and AI SDK tools in `src/ai.ts`.

## STRUCTURE

```
obsxa/
|- src/
|  |- cli.ts           # citty CLI entrypoint
|  |- index.ts         # createObsxa API + migration/bootstrap path
|  |- ai.ts            # AI SDK tools (zod discriminated unions)
|  |- commands/        # CLI subcommand handlers
|  `- core/            # stores, schema, dedup/analysis/search logic
|- test/               # integration + parser tests
|- drizzle/            # SQL migrations + drizzle metadata
`- .github/workflows/  # test/release/autofix automation
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| CLI routing | `src/cli.ts` | Dynamic imports per command module |
| Runtime/bootstrap | `src/index.ts` | Meta table, schema versioning, migration, FTS triggers |
| DB schema | `src/core/db.ts` | Drizzle sqlite table declarations |
| Observation lifecycle | `src/core/observation.ts` | Add/update/promote/archive/dismiss flow |
| Dedup + merge | `src/core/dedup.ts` | Similarity scoring + merge transaction |
| AI tool contracts | `src/ai.ts` | Multi-operation tool schemas |
| CLI arg validation | `src/commands/observation.ts` | Parsing, percent range checks, import/export |
| End-to-end behavior | `test/index.test.ts` | Full lifecycle + migration safety |
| Real-world scenario test | `test/usgs-earthquake.test.ts` | Large fixture-driven integration test |

## CODE MAP

| Symbol | Type | Location | Refs | Role |
|--------|------|----------|------|------|
| `createObsxa` | Function | `src/index.ts` | High | Main API constructor + bootstrap pipeline |
| `createDedupStore` | Function | `src/core/dedup.ts` | High | Duplicate scan/review/merge engine |
| `main` | Constant | `src/cli.ts` | Medium | CLI command graph root |
| `observationTool` | Constant | `src/ai.ts` | Medium | AI SDK observation operations |

## CONVENTIONS

- Runtime is Node >= 22, package manager is pnpm, build tool is obuild.
- `src/commands` modules follow citty `defineCommand` style with `_db.ts` helpers.
- Tests are in `test/` and favor temp SQLite DB isolation instead of mocks.
- Release path is tag-driven CI + `pnpm release` (`test:run && build && changelogen`).

## ANTI-PATTERNS (THIS PROJECT)

- Do not introduce CommonJS; repo is ESM-only (`package.json`, `AGENTS.md`).
- Do not use `as any`, `@ts-ignore`, or `@ts-expect-error` (`AGENTS.md`).
- Do not bypass Drizzle migration flow for schema changes (`AGENTS.md`, `drizzle.config.ts`).
- Do not remove `--json`/`--toon` output parity from CLI commands (`AGENTS.md`, command files).
- Do not treat `drizzle/meta` and `dist/` as hand-edited source of truth.

## UNIQUE STYLES

- Store factories are split by domain (`create*Store`) and composed in `createObsxa`.
- Dedup scoring combines exact fingerprints + token/trigram similarity and persists review events.
- CLI command files are thin wrappers around store methods with explicit input coercion.

## COMMANDS

```bash
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
pnpm generate
pnpm release
```

## NOTES

- `release.yml` publishes on `v*` tags with `--no-git-checks`; local validation still expected.
- `autofix.yml` can push lint-fix commits on PRs and main.
- `obsxa.db*` files may exist locally; treat as runtime artifacts.

<!-- skilld -->

Before modifying code, evaluate each installed skill against the current task.
For each skill, determine YES/NO relevance and invoke all YES skills before proceeding.

<!-- /skilld -->
