# AGENTS.md

## Stack

- **Runtime**: Node.js >= 22
- **Language**: TypeScript (strict)
- **Build**: obuild (zero-config ESM builder)
- **Test**: vitest
- **Lint**: oxlint + oxfmt
- **Typecheck**: tsgo (native TypeScript)
- **Release**: changelogen
- **Package manager**: pnpm
- **Database**: SQLite via libsql + drizzle-orm
- **Schema migrations**: drizzle-kit

## Scripts

- `pnpm dev` - stub build for development
- `pnpm build` - production build
- `pnpm test` - run tests (watch)
- `pnpm test:run` - run tests (single run)
- `pnpm lint` - lint + format check
- `pnpm lint:fix` - auto-fix lint + format
- `pnpm typecheck` - type checking
- `pnpm generate` - generate drizzle migrations
- `pnpm release` - test, build, and release

## Structure

```
src/
  core/       - database, schema, CRUD operations
  commands/   - CLI command handlers (citty)
  index.ts    - public API barrel
  ai.ts       - AI SDK tool exports
  cli.ts      - CLI entrypoint
  backup.ts   - database backup/restore
  types.ts    - shared types
test/         - tests
drizzle/      - schema migrations
dist/         - build output (generated)
```

## Conventions

- ESM only (`"type": "module"`)
- Exports use `.d.mts` / `.mjs` extensions
- Strict TypeScript (all strict checks enabled)
- No `as any`, `@ts-ignore`, or `@ts-expect-error`
- SQLite schema changes go through drizzle-kit migrations
- CLI supports `--json` and `--toon` output formats
