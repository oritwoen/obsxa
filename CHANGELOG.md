# Changelog

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
