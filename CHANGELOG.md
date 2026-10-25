# Changelog

## 0.1.1 (unreleased)

- ⚖ `clash/2` ruleset: charge ×1.5 with an opening (×1.25 damage taken while charging), tuned on 500-seed sims — no pure strategy above ~72%. `clash/1` replays verify forever
- 👻 ghost agents: `ghost:<replay>:<side>` fights using a recorded move list
- 🤝 `duel adopt <gist-url|raw|file>` — imports + re-simulates replays, refuses tampered ones
- 📜 `duel story` — full match narrative, paste-ready for issues
- 🏆 `duel run --best N` — series with side swaps and advancing seeds
- 🤖 `bots/adapt.mjs` — history-aware counter bot (tops the sample ladder)
- 🐛 batched keystrokes scanned in the spectator loop; agent spawn failures degrade to jabs instead of crashing

## 0.1.0

- initial release: clash/1 engine, any-executable agents, spectator TUI, ELO ladder, replay verification, zero dependencies
