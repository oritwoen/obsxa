# COMMANDS KNOWLEDGE BASE

## OVERVIEW

`src/commands` contains citty command handlers that map CLI args to store operations and enforce CLI-level validation/output behavior.

## STRUCTURE

```
commands/
|- _db.ts           # shared db/open/output/id parsing helpers
|- project.ts       # project add/list
|- observation.ts   # add/get/list/update/import/export/batch/lifecycle
|- relation.ts      # relation add/list
|- dedup.ts         # scan/candidates/review/merge
|- cluster.ts       # cluster add/list/member/members
|- search.ts        # free-text search wrapper
|- status.ts        # stats dashboard wrapper
|- triage.ts        # ranked active observations
|- frequent.ts      # repeated observations
|- unpromoted.ts    # active observations not promoted
|- promote.ts       # observation -> hypothesis ref
`- backup.ts        # create/restore db backups
```

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Shared args/output format | `_db.ts` | `dbArgs`, JSON/TOON output, ID parsing |
| Complex argument parsing | `observation.ts` | percent validation, import/export format parsing |
| Dedup CLI flow | `dedup.ts` | threshold/status/options coercion |
| Reporting commands | `status.ts`, `triage.ts`, `frequent.ts`, `unpromoted.ts` | thin wrappers around analysis store |
| Backup UX | `backup.ts` | validates paths + backup/restore command boundary |

## CONVENTIONS

- Commands are thin wrappers: parse/coerce args, call store, print via `consola` or `_db.output`.
- Keep `--json` and `--toon` parity for machine-readable output.
- Validate user input eagerly and fail with explicit `consola.error` + `process.exit(1)`.
- Prefer subcommand grouping under domain command files over flat CLI logic in `cli.ts`.

## ANTI-PATTERNS

- Do not bypass `_db.ts` output conventions for structured output paths.
- Do not add option parsing that permits out-of-range percentage values.
- Do not change command behavior in ways that desync CLI output from store return shape.
- Do not inline database bootstrap logic per command; keep shared open/close flow.
