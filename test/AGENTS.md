# TEST KNOWLEDGE BASE

## OVERVIEW

`test/` validates end-to-end obsxa behavior with real sqlite files and focused parser tests.

## STRUCTURE

```
test/
|- index.test.ts           # broad integration and migration checks
|- observation-parse.test.ts
`- usgs-earthquake.test.ts # large fixture scenario
```

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Full lifecycle coverage | `index.test.ts` | project/observation/relation/cluster/dedup/analysis + migration safety |
| CLI parsing + validation | `observation-parse.test.ts` | parse helpers and `process.exit` behavior |
| Real-world pipeline | `usgs-earthquake.test.ts` | fixture-heavy scenario and cross-feature integration |

## CONVENTIONS

- Use temp db directories (`mkdtempSync`) and cleanup in suite lifecycle hooks.
- Prefer integration tests over mocks for store behavior.
- Treat parser failures as process-level exits and assert them explicitly.
- Keep tests deterministic even when using large fixtures.

## ANTI-PATTERNS

- Do not share sqlite files across tests; isolation is expected.
- Do not weaken coverage of migration/backup and lifecycle transitions.
- Do not replace meaningful integration assertions with snapshot-only checks.
- Do not silently ignore `process.exit` paths in CLI validation tests.
