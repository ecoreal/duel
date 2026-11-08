# Contributing to duel

Small, sharp tool — same rules apply. Thanks for helping!

## Development setup

```bash
git clone https://github.com/ecoreal/duel && cd duel
npm test          # node:test, offline
```

Node ≥ 18.17, **zero dependencies** — stdlib only. If a feature needs a
package, it belongs in a separate project.

## Modules

engine.js (frozen clash math) · agent.js (spawn/protocol) · film.js/gif.js (replay→GIF) · render.js · season/tournament/elo

## Ground rules

- **Engine math is FROZEN** (`clash/1` + `clash/2` replay compatibility): don't touch RNG consumption, ordering or rounding in `playClash`.
- **Bots must be executable** (`chmod +x`, shebang) — the engine runs them via `sh -c`.
- **Never spread large arrays** (frames are ~200k pixels); node:test worker stacks overflow on macOS.
- **Bots are content.** New bots welcome as one file in `bots/`, any language — plus eval numbers in the description.

## Commit style

Short, imperative, emoji-prefixed to match the house style:
`✨ features · 🐛 fixes · 📝 docs · 🔧 CI/build`.

## Filing issues

Include: the exact command, `--json` output where applicable (redact anything
private), Node version, and what you expected vs got.
