---
name: drizzle-kit-skilld
description: 'ALWAYS use when writing code importing "drizzle-kit". Consult for debugging, best practices, or modifying drizzle-kit, drizzle kit, drizzle-orm, drizzle orm.'
metadata:
  version: 0.31.9
  generated_by: Codex · GPT-5.3 Codex
  generated_at: 2026-03-11
---

# drizzle-team/drizzle-orm `drizzle-kit`

**Version:** 0.31.9 (Feb 2026)
**Deps:** @drizzle-team/brocli@^0.10.2, @esbuild-kit/esm-loader@^2.5.5, esbuild@^0.25.4, esbuild-register@^3.5.0
**Tags:** mysql-fixes: 0.16.9-dae8c3d (Feb 2023), introspect-fixes: 0.17.0-7c10593 (Mar 2023), dan: 0.17.1-609a4f0 (Mar 2023), test-db-push: 0.17.6-76e73f3 (Apr 2023), push-to-release: 0.18.0-1ac9ef5 (May 2023), db-push: 0.18.0-27440c3 (May 2023), esm: 0.18.1-29ffb44 (Jun 2023), sqlite-push: 0.19.0-9770e22 (Jun 2023), is-fixes: 0.19.1-07a81ee (Jun 2023), win: 0.19.2-b928697 (Jun 2023), fix-windows-test-runner: 0.19.2-bf7afa2 (Jun 2023), cjs: 0.19.2-0fc6b10 (Jun 2023), mysql-uniques: 0.19.6-8c1d0e5 (Jul 2023), fixes-pg: 0.19.11-81b40a4 (Jul 2023), fix-sqlite-push: 0.19.12-2157698 (Jul 2023), utils: 0.19.13-8d44e32 (Aug 2023), studio-d1: 0.19.14-039355d (Sep 2023), 0-20-0: 0.20.0-e44f3ff (Nov 2023), config: 0.20.1-56e7be6 (Nov 2023), pk-issue: 0.20.5-c7dc2fe (Nov 2023), mysql-sqlite-functions: 0.20.5-608ae62 (Nov 2023), fk-introspect: 0.20.7-4f47c46 (Dec 2023), fix-fks: 0.20.9-1dc10f5 (Jan 2024), introspect-schema: 0.20.14-a77266f (Feb 2024), fix-defaults: 0.20.14-fa7577a (Feb 2024), payload: 0.20.14-d8f1e46 (Mar 2024), studio: 0.20.17-f62f2f6 (Apr 2024), pull-relations: 0.20.17-6785c69 (May 2024), patches-021: 0.21.2-dd5c3c4 (May 2024), workspaces: 0.21.0-5196c95 (May 2024), pgvector: 0.22.0-5b09380 (May 2024), d1: 0.22.0-3c62a84 (May 2024), feat/migration-prefixes: 0.22.7-0d9043a (Jun 2024), generated: 0.23.0-03c18d1 (Jul 2024), payload_v3: 0.23.0-4fa9580 (Jul 2024), seq_fix: 0.23.1-0be85c4 (Jul 2024), enums_fix: 0.23.1-7816536 (Jul 2024), kit: 0.23.2-e9a7a6c (Aug 2024), defaults-kit: 0.24.1-781dea0 (Aug 2024), pglite: 0.24.1-626cc95 (Aug 2024), migrations3: 0.24.2-87df7e9 (Aug 2024), drizzle-kit/libsql-push-migrate: 0.24.2-1321cf9 (Sep 2024), count-generator: 0.24.2-8cf7a61 (Sep 2024), optimize: 0.25.0-605ef48 (Sep 2024), newtypes: 0.26.2-57d2372 (Oct 2024), is-config-fixes: 0.28.1-4b33aac (Nov 2024), drizzle-kit/fix-recreate: 0.30.4-dc3b366 (Feb 2025), numeric-modes: 1.0.0-beta.1-867d080 (Mar 2025), rqb-v1-schema-fix: 1.0.0-beta.1-b96a4f8 (Mar 2025), optimize-tests-main: 0.30.5-83f67e4 (Mar 2025), deduplicate-exports: 0.30.6-014cdb8 (Apr 2025), mssql: 0.31.0-f677fb2 (May 2025), test-pipeline: 0.31.1-08944da (May 2025), exts-s3-file: 0.31.1-512acc4 (Jun 2025), sqlite-better-blob: 0.31.4-5f2d36c (Aug 2025), rqb-typeperf: 1.0.0-beta.1-69a2ca0 (Aug 2025), effect: 1.0.0-beta.1-cdf226f (Sep 2025), main-next-pack: 0.31.7-82993ae (Nov 2025), kit-checks: 0.31.7-391d33b (Nov 2025), workflows: 1.0.0-beta.1-37e2608 (Nov 2025), sqlite-cloud-studio: 1.0.0-beta.1-bc61bbe (Nov 2025), beta-next-pack: 1.0.0-beta.1-140e6cc (Nov 2025), alternation-engine: 1.0.0-beta.2-6565b14 (Dec 2025), main-workflows: 0.31.8-6357645 (Dec 2025), kit-cli-wrong-config-hints: 1.0.0-beta.2-a1a6b39 (Dec 2025), studio-benchmark: 1.0.0-beta.2-01787d6 (Dec 2025), rqb-perf-patch: 1.0.0-beta.2-f9236e3 (Dec 2025), kit-duckdb: 1.0.0-beta.3-d4ff358 (Dec 2025), mysql-blob-rqb-v2-fix: 1.0.0-beta.5-e0482ac (Dec 2025), beta-fixes: 1.0.0-beta.6-7419dcb (Dec 2025), beelink: 1.0.0-beta.9-c26fd2f (Jan 2026), effect3: 1.0.0-beta.9-635dfc2 (Jan 2026), effect-fixes: 1.0.0-beta.10-9f1399e (Jan 2026), bun-timestampstring-patch: 1.0.0-beta.10-4a698ad (Jan 2026), drizzle-seed/bug-fixes: 1.0.0-beta.10-7f0f68a (Jan 2026), issues: 1.0.0-beta.11-165921d (Jan 2026), effect-cache-fix: 1.0.0-beta.11-88ca292 (Jan 2026), data-migrator: 1.0.0-beta.11-c3fb442 (Jan 2026), update/migrator-strategy: 1.0.0-beta.12-5845444 (Jan 2026), drizzle-effect: 1.0.0-beta.13-f16bdca (Feb 2026), pg-prepare-nameless: 1.0.0-beta.13-4ef3fca (Feb 2026), kit-introspect: 1.0.0-beta.13-ba3365d (Feb 2026), issues2: 1.0.0-beta.14-89db290 (Feb 2026), effect-validator: 1.0.0-beta.14-56118cc (Feb 2026), sql-explicit-origin: 1.0.0-beta.15-90d1d1a (Feb 2026), latest: 0.31.9 (Feb 2026), codecs: 1.0.0-beta.15-9ddd000 (Mar 2026), beta.16: 1.0.0-beta.16-2ffd1a5 (Mar 2026), beta: 1.0.0-beta.17-67b1795 (Mar 2026), node-sqlite: 1.0.0-beta.16-c2458b2 (Mar 2026), sqlite-indexes: 1.0.0-beta.16-501e9b2 (Mar 2026), beta.17: 1.0.0-beta.17-160831b (Mar 2026)

**References:** [package.json](./.skilld/pkg/package.json) — exports, entry points • [README](./.skilld/pkg/README.md) — setup, basic usage • [Docs](./.skilld/docs/_INDEX.md) — API reference, guides • [GitHub Issues](./.skilld/issues/_INDEX.md) — bugs, workarounds, edge cases • [GitHub Discussions](./.skilld/discussions/_INDEX.md) — Q&A, patterns, recipes • [Releases](./.skilld/releases/_INDEX.md) — changelog, breaking changes, new APIs

## Search

Use `skilld search` instead of grepping `.skilld/` directories — hybrid semantic + keyword search across all indexed docs, issues, and releases. If `skilld` is unavailable, use `npx -y skilld search`.

```bash
skilld search "query" -p drizzle-kit
skilld search "issues:error handling" -p drizzle-kit
skilld search "releases:deprecated" -p drizzle-kit
```

Filters: `docs:`, `issues:`, `releases:` prefix narrows by source type.

<!-- skilld:api-changes -->

## API Changes

- BREAKING: `postgres.js` driver instances passed to `drizzle()` now always return string dates and are mutated to use date mapping via `.toISOString()`, so downstream code that relied on external `postgres.js` date objects should migrate before upgrading. [source](./.skilld/docs/docs/latest-releases/drizzle-orm-v0300.md:L15-L23)
- DEPRECATED: default `primaryKey()` syntax is deprecated in favor of named key syntax, so schema definitions that rely on the old inline `primaryKey()` form should be updated. [source](./.skilld/docs/docs/latest-releases/drizzle-orm-v0290.md:L37)
- DEPRECATED: Passing `database-js` `connect()` result to `drizzle` is deprecated; users are expected to move to `new Client()` usage. [source](./.skilld/docs/docs/latest-releases/drizzle-orm-v0294.md:L23-L29)
- BREAKING: PostgreSQL index API was rewritten, including moving SQL expressions and sort/null modifiers into per-expression `.on()`/`.using()`/`.asc()`/`.desc()`/`.nullsFirst()`/`.nullsLast()` usage. [source](./.skilld/docs/docs/latest-releases/drizzle-orm-v0310.md:L17-L27)
- NEW: `drizzle.config` now accepts `extensionsFilters` to skip PostGIS internal tables during `push`/`introspect`. [source](./.skilld/docs/docs/latest-releases/drizzle-orm-v0310.md:L98-L106)
- NEW: Drizzle Kit can now handle PostgreSQL extension objects `point`, `line`, `vector`, and `geometry` in `drizzle-kit` processing. [source](./.skilld/docs/docs/latest-releases/drizzle-orm-v0310.md:L90-L97)
- NEW: PostgreSQL geometry support adds `geometry` types with mode-based mapping via `point` and `line` for PostGIS usage. [source](./.skilld/docs/docs/latest-releases/drizzle-orm-v0310.md:L69-L83)
- NEW: Query builder gained `withReplicas` support for read-replica routing across dialects. [source](./.skilld/docs/docs/latest-releases/drizzle-orm-v0290.md:L41-L48)
- NEW: `withReplica` selection now supports `setWhere` and `targetWhere` fields in `.onConflictDoUpdate()` instead of a single `where`, changing the config shape. [source](./.skilld/docs/docs/latest-releases/drizzle-orm-v0308.md:L25-L26)
- BREAKING: SQLite `drizzle` conflict config also uses `.onConflictDoUpdate()`'s `setWhere`/`targetWhere` fields instead of the old single `where` field. [source](./.skilld/docs/docs/latest-releases/drizzle-orm-v0309.md:L15-L16)
- NEW: `db._.fullSchema` was added for schema inspection on Drizzle instances. [source](./.skilld/docs/docs/latest-releases/drizzle-orm-v0309.md:L19)
- NEW: `db.batch(...)` can now use `db.execute(...)` for Neon HTTP batches. [source](./.skilld/docs/docs/latest-releases/drizzle-orm-v0303.md:L15)
- NEW: Added `.if()` helper for WHERE expressions. [source](./.skilld/docs/docs/latest-releases/drizzle-orm-v03010.md:L15-L16)
- NEW: `useLiveQuery(databaseQuery)` React hook was added for live query updates with `data`, `error`, and `updatedAt`. [source](./.skilld/docs/docs/latest-releases/drizzle-orm-v0311.md:L15-L23)
- NEW: `$onUpdate` column callback is available for PostgreSQL, MySQL, and SQLite. [source](./.skilld/docs/docs/latest-releases/drizzle-orm-v0305.md:L15-L17)
- NEW: Added custom schema support when working with PostgreSQL enums. [source](./.skilld/docs/docs/latest-releases/drizzle-orm-v0308.md:L15-L16)

Also changed: `db` Op-SQLite driver support in `drizzle-orm/op-sqlite` · `drizzle-orm/xata` (Xata HTTP) driver support · `pglite` driver support · `TiDB Cloud` serverless driver support.

<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->

## Best Practices

- Use `drizzle-kit generate` as the primary code-first migration authoring path, since it diffs current schema snapshots and writes both `migration.sql` and `snapshot.json` so downstream tools can apply migrations consistently. [source](./.skilld/docs/docs/drizzle-kit-generate.md:L23-L30)

- Keep schema definitions split across one or many files and pass them via the `schema` glob; this is the supported input model when generating from large codebases. [source](./.skilld/docs/docs/drizzle-kit-generate.md:L40-L43)

- Set a deterministic migration filename with `--name` when human-readable or release-specific naming is important. [source](./.skilld/docs/docs/drizzle-kit-generate.md:L50-L53)

- When schema changes are outside drizzle-kit capabilities (for example DDL variants or explicit seeding), create empty custom migration files and run them through `drizzle-kit migrate`. [source](./.skilld/docs/docs/kit-custom-migrations.md:L21-L21)

- Run `drizzle-kit check` in collaborative/branch-heavy repos to validate that generated migration history remains consistent. [source](./.skilld/docs/docs/drizzle-kit-check.md:L20-L23)

- Use `drizzle-kit migrate` for applying migration files in order, because it uses the DB migrations log table to select only unapplied SQL. [source](./.skilld/docs/docs/drizzle-kit-migrate.md:L24-L30)

- If your environment needs custom migrations metadata placement, prefer setting drizzle config options (`table` and PostgreSQL `schema`) instead of relying on defaults. [source](./.skilld/docs/docs/drizzle-kit-migrate.md:L39-L42)

- Treat `--ignore-conflicts` as a narrow fallback: docs explicitly warn its use usually means drizzle-kit missed a conflict check edge. [source](./.skilld/docs/docs/drizzle-kit-migrate.md:L43-L49)

- After a drizzle-kit release with breaking snapshot format changes, run `drizzle-kit up` before continuing schema work. [source](./.skilld/docs/docs/drizzle-kit-up.md:L20-L20)

- Use multiple config files when you manage multiple stages or multiple databases to avoid swapping urls/credentials inside one config file. [source](./.skilld/docs/docs/drizzle-kit-generate.md:L54-L56)

- For teams needing custom migration tracking storage, configure `migrationsTable` and, on PostgreSQL, `migrationsSchema` instead of relying on defaults. [source](./.skilld/docs/docs/latest-releases/drizzle-orm-v0295.md:L31-L42)

- On PostGIS-backed schemas, set `extensionsFilters` for `postgis` so system tables are skipped during diffs rather than polluting future migrations. [source](./.skilld/docs/docs/latest-releases/drizzle-orm-v0310.md:L98-L107)
<!-- /skilld:best-practices -->
