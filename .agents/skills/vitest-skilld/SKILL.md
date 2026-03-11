---
name: vitest-skilld
description: 'ALWAYS use when writing code importing "vitest". Consult for debugging, best practices, or modifying vitest.'
metadata:
  version: 4.0.18
  generated_by: Codex · GPT-5.3 Codex
  generated_at: 2026-03-11
---

# vitest-dev/vitest `vitest`

**Version:** 4.0.18 (Jan 2026)
**Deps:** es-module-lexer@^1.7.0, expect-type@^1.2.2, magic-string@^0.30.21, obug@^2.1.1, pathe@^2.0.3, picomatch@^4.0.3, std-env@^3.10.0, tinybench@^2.9.0, tinyexec@^1.0.2, tinyglobby@^0.2.15, tinyrainbow@^3.0.3, vite@^6.0.0 || ^7.0.0, why-is-node-running@^2.3.0, @vitest/mocker@4.0.18, @vitest/expect@4.0.18, @vitest/runner@4.0.18, @vitest/pretty-format@4.0.18, @vitest/snapshot@4.0.18, @vitest/spy@4.0.18, @vitest/utils@4.0.18
**Tags:** latest: 4.0.18 (Jan 2026), beta: 4.1.0-beta.6 (Mar 2026)

**References:** [package.json](./.skilld/pkg/package.json) — exports, entry points • [README](./.skilld/pkg/README.md) — setup, basic usage • [Docs](./.skilld/docs/_INDEX.md) — API reference, guides • [GitHub Issues](./.skilld/issues/_INDEX.md) — bugs, workarounds, edge cases • [GitHub Discussions](./.skilld/discussions/_INDEX.md) — Q&A, patterns, recipes • [Releases](./.skilld/releases/_INDEX.md) — changelog, breaking changes, new APIs

## Search

Use `skilld search` instead of grepping `.skilld/` directories — hybrid semantic + keyword search across all indexed docs, issues, and releases. If `skilld` is unavailable, use `npx -y skilld search`.

```bash
skilld search "query" -p vitest
skilld search "issues:error handling" -p vitest
skilld search "releases:deprecated" -p vitest
```

Filters: `docs:`, `issues:`, `releases:` prefix narrows by source type.

<!-- skilld:api-changes -->

## API Changes

- BREAKING: `ErrorWithDiff` was removed in favor of `TestError`, so imports/extension code referencing `ErrorWithDiff` now fail at compile/runtime [source](./.skilld/releases/v4.0.0.md:L18)
- BREAKING: `test(name, fn, options)` and `describe(name, fn, options)` no longer accept the third argument options object; use the second argument for options and keep timeout as third number-only [source](./.skilld/docs/guide/migration.md:L482-L487)
- BREAKING: `workspace` config is removed in favor of `projects`, so `workspace: './vitest.workspace.js'` and `defineWorkspace()` are no longer valid config patterns [source](./.skilld/releases/v4.0.0.md:L27-L32) [source](./.skilld/docs/guide/migration.md:L221-L240)
- BREAKING: `poolOptions` is removed and pool settings moved to top-level; `maxThreads`/`maxForks` are now `maxWorkers` and project options in a single config branch [source](./.skilld/docs/guide/migration.md:L318-L324)
- BREAKING: `minWorkers` is removed; worker scaling now uses `maxWorkers` and no longer consumes `minWorkers` separately [source](./.skilld/releases/v4.0.0.md:L32) [source](./.skilld/docs/guide/migration.md:L481)
- BREAKING: `deps.optimizer.web` was renamed to `deps.optimizer.client`, so old optimizer config keys are ignored [source](./.skilld/docs/guide/migration.md:L215)
- BREAKING: `deps.external`, `deps.inline`, and `deps.fallbackCJS` were moved from deprecated top-level API to `server.deps` equivalents [source](./.skilld/docs/guide/migration.md:L479)
- BREAKING: `coverage.all` is removed; default Vitest 4 behavior reports only covered files unless `coverage.include` is set explicitly [source](./.skilld/docs/guide/migration.md:L25-L34)
- BREAKING: `coverage.extensions` is removed from config and no longer controls file matching [source](./.skilld/docs/guide/migration.md:L47-L50)
- BREAKING: `coverage.ignoreEmptyLines` is removed and `coverage.experimentalAstAwareRemapping` is no longer a configurable option [source](./.skilld/docs/guide/migration.md:L21-L23)
- BREAKING: `basic` reporter was removed from built-in reporters [source](./.skilld/releases/v4.0.0.md:L15)
- BREAKING: Browser provider value is now expected as a factory object (for example `playwright({ launchOptions })`) instead of a string, so string providers like `'playwright'` no longer configure browsers [source](./.skilld/releases/v4.0.0.md:L37) [source](./.skilld/docs/guide/migration.md:L259-L273)
- DEPRECATED: `browser.isolate` and `browser.fileParallelism` are deprecated, move these concerns to `isolate` / `fileParallelism` top-level project options [source](./.skilld/releases/v4.0.7.md:L14)
- NEW: `onUnhandledError` and new test runner control APIs were added (`enableCoverage()`, `disableCoverage()`, `getSeed()`, `getGlobalTestNamePattern()`, and `relativeModuleId`) for advanced integration and reporter flows [source](./.skilld/releases/v4.0.0.md:L48-L65)

Also changed: `onModuleRunner` (experimental) added to `worker.init` · `setupEnvironment` exported for custom pools (experimental) · `collect` → `import` and `prepare` removed (v4.0.14) · `experimental_parseSpecifications` added · `extensible test artifact API` added · `toBeOneOf` now supports `Set`

<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->

## Best Practices

- Prefer disabling test isolation (`--no-isolate` or `isolate: false`) for suites that are side-effect free and properly cleanup state, because this removes per-file isolation overhead; avoid it when tests rely on isolation for correctness. [source](./.skilld/docs/guide/improving-performance.md#test-isolation)
- Favor `pool: 'threads'` when native process APIs are not required, because threads are typically faster than the default `forks` pool in larger suites; keep `forks` when you hit process-level compatibility issues like native addons and hard process API dependencies. [source](./.skilld/docs/config/pool.md#threads)
- If you choose VM-based pools (`vmThreads`/`vmForks`), pair that decision with `vmMemoryLimit` tuning (`vmThreads`/`vmForks` are explicitly listed as memory-leak-prone in VM contexts). [source](./.skilld/docs/config/pool.md#vmthreads), [source](./.skilld/docs/config/vmmemorylimit.md#vmmemorylimit)
- Use test sharding with `--shard` only as a distributed strategy (`--reporter=blob`) and always merge shard artifacts with `--merge-reports`; blobs split by test files, so this pattern is for suite-level partitioning, not balanced test-case balancing. [source](./.skilld/docs/guide/improving-performance.md#sharding), [source](./.skilld/docs/guide/reporters.md#blob-reporter)
- For browser automation, use Playwright/WebdriverIO providers for real workflows (especially CI), and reserve `preview` for lightweight visual previewing; preview is documented as lacking multi-instance/headless and automation-level features. [source](./.skilld/docs/guide/browser/index.md#browser-mode), [source](./.skilld/docs/config/browser/preview.md#differences-with-other-providers)
- Configure browser tracing with failure/retry-focused modes (`retain-on-failure`, `on-first-retry`, `on-all-retries`) and avoid `'on'` by default, since full tracing is explicitly marked performance heavy. [source](./.skilld/docs/config/browser/trace.md#browser-trace)
- For headless-only failures in browser mode, set an explicit viewport before test behavior changes; in maintainer-confirmed browser discussion guidance, increasing viewport size can stop mobile-like headless layout breakage. [source](./.skilld/docs/guide/browser/index.md#headless), [source](./.skilld/discussions/discussion-9067.md:L28)
- (experimental) Use `experimental.openTelemetry` as a targeted debugging hook rather than default behavior: OpenTelemetry init adds startup overhead unless isolation is disabled, so enable it only when tracing is needed. [source](./.skilld/docs/config/experimental.md#experimental-opentelemetry), [source](./.skilld/docs/guide/open-telemetry.md#open-telemetry-support)
- Move expensive one-off setup into `globalSetup` and pass values through `provide`/`inject` for worker availability; use `setupFiles` only for code that must execute in the same process as each test file. [source](./.skilld/docs/config/globalsetup.md#globalsetup), [source](./.skilld/docs/config/setupfiles.md#setupfiles)
- In browser mode module mocks, prefer `vi.mock('...', { spy: true })` because native ESM module namespace replacement is blocked; for class mocks, Vitest 4 docs prefer class-syntax `vi.fn(class { ... })` so behavior remains aligned with class mocking expectations. [source](./.skilld/docs/guide/mocking/modules.md#mocking-modules), [source](./.skilld/docs/guide/mocking/classes.md#mocking-classes)
<!-- /skilld:best-practices -->
