# CORE KNOWLEDGE BASE

## OVERVIEW

`src/core` is the data and domain layer: schema-backed stores for project, observation, relation, cluster, dedup, analysis, and search.

## STRUCTURE

```
core/
|- db.ts           # Drizzle sqlite table declarations
|- mappers.ts      # Row -> domain mapping + scoring helpers
|- project.ts      # Project CRUD store
|- observation.ts  # Observation lifecycle + edits/transitions
|- relation.ts     # Relation validation + dedupe behavior
|- cluster.ts      # Cluster + member management
|- dedup.ts        # Candidate scan, review, merge workflow
|- analysis.ts     # Aggregates and triage ranking
`- search.ts       # FTS query + fallback search
```

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Schema changes | `db.ts` | All table declarations + constraints start here |
| Observation business rules | `observation.ts` | Status transitions, validation, edit history |
| Duplicate logic | `dedup.ts` | Matching, candidate events, merge transaction |
| Aggregates + triage | `analysis.ts` | Stats, convergent, isolated, triage sorting |
| Search behavior | `search.ts` | FTS5 path + LIKE fallback |
| Cross-module mapping | `mappers.ts` | Shared conversion/scoring helpers |

## CONVENTIONS

- Export one store factory per file: `create*Store(db)`.
- Prefer explicit domain errors (`throw new Error(...)`) over silent failures.
- Use Drizzle query builders; keep raw SQL isolated to narrow cases.
- Keep transaction-heavy flows contained (notably in `dedup.ts` and lifecycle updates).

## ANTI-PATTERNS

- Do not mutate schema without migration artifacts in `drizzle/`.
- Do not skip transition/event rows when changing observation status.
- Do not break score normalization assumptions (`0..100` domain for percentages, `0..1` dedup threshold input).
- Do not introduce cross-project relation/merge behavior that bypasses current guards.
