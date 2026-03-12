# Changelog

## v0.0.3

[compare changes](https://github.com/oritwoen/obsxa/compare/v0.0.2...v0.0.3)

### 🚀 Enhancements

- Add opencode plugin and xdg defaults ([#9](https://github.com/oritwoen/obsxa/pull/9))

### 🩹 Fixes

- **cli:** Validate observation percentage inputs ([#13](https://github.com/oritwoen/obsxa/pull/13))
- **cli:** Add --toon parity to backup command ([#14](https://github.com/oritwoen/obsxa/pull/14))
- **search:** Avoid silent fallback on non-recoverable FTS failures ([#15](https://github.com/oritwoen/obsxa/pull/15))
- **release:** Avoid double bump by replacing changelogen --release with manual git flow ([99f9a5b](https://github.com/oritwoen/obsxa/commit/99f9a5b))

### 💅 Refactors

- **db:** Migrate to async libsql backend ([#11](https://github.com/oritwoen/obsxa/pull/11))

### 🏡 Chore

- Apply automated updates ([c878b4a](https://github.com/oritwoen/obsxa/commit/c878b4a))
- Add `.agents/skills` ([1ba98fb](https://github.com/oritwoen/obsxa/commit/1ba98fb))
- Apply automated updates ([aaea389](https://github.com/oritwoen/obsxa/commit/aaea389))
- Improve AGENTS.md ([cedc270](https://github.com/oritwoen/obsxa/commit/cedc270))
- Apply automated updates ([9ae3d79](https://github.com/oritwoen/obsxa/commit/9ae3d79))
- Update AGENTS.md ([aae1182](https://github.com/oritwoen/obsxa/commit/aae1182))
- **release:** Ship opencode wrapper flow ([#19](https://github.com/oritwoen/obsxa/pull/19))

### ❤️ Contributors

- Oritwoen ([@oritwoen](https://github.com/oritwoen))
- Ori ([@oritwoen](https://github.com/oritwoen))

## Unreleased

### 🏡 Chore

- **release:** Simplify release flow to one script and sync version for wrapper `opencode` package
- **release:** Publish wrapper package from `opencode/` in release workflow
- **release:** Keep single root changelog/release and sync wrapper package metadata only

### ⚠️ Notes

- **db path:** `createObsxa()` now defaults to an XDG-compliant data path (`~/.local/share/obsxa/obsxa.db` on Linux) instead of `./obsxa.db`. Pass `db: "./obsxa.db"` explicitly to keep legacy location.

## v0.0.2

### 🏡 Chore

- **tooling:** Sync with template-ts ([#2](https://github.com/oritwoen/obsxa/pull/2))

### ❤️ Contributors

- Ori ([@oritwoen](https://github.com/oritwoen))
