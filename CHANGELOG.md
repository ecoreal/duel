# Changelog

## Unreleased

- 🤝 community onboarding pack for rope/1 — `bots/tugger.mjs` (readable starter bot, honest eval in its header: 25% vs `builtin:rope-greedy`), an example rope replay (`examples/rope-greedy-vs-random.json`), a "write a rope bot" snippet in the README, and the weekly season workflow now also runs a rope ladder (`rope:` champion lines in `results/history.md`, clash format untouched)
- ⚓ `rope/1` — game #2, tug of war on a 13-cell rope (`--game rope/1` everywhere: run/eval/tournament/ladder/season + `duel rules rope/1`). Knot to ±6 or the lean wins at turn 30; `haul`/`lunge` (15% slips), `lean` (halve the foe's pull), `rest`. Tuned on a 1000-seed matrix (`scripts/sim-rope.mjs`): haul-only vs the rest-then-haul counter 58%, and a rock-paper-scissors cycle (hauler → rest-haul → counter → lunger) so no naive strategy dominates. Ships with `builtin:rope-greedy`; `builtin:random` plays rope for free via agentView
- 🎬 `duel film <replay> [--every N]` — arena storyboard frames with biggest-hit/final tags
- 🥇 `duel tournament` — single-elimination bracket with deterministic seeding, byes at odd positions, best-of-N + sudden death; tournament.json records every match's seed and moves
- 📋 `duel rules [game]` — rulesets printed in the CLI
- ⚔️ `bots/berserker.mjs` — never heals (honest eval in its header)

## 0.1.1 (2026-10-25)

- ⚖ `clash/2` ruleset: charge ×1.5 with an opening (×1.25 damage taken while charging), tuned on 500-seed sims — no pure strategy above ~72%. `clash/1` replays verify forever
- 👻 ghost agents: `ghost:<replay>:<side>` fights using a recorded move list
- 🤝 `duel adopt <gist-url|raw|file>` — imports + re-simulates replays, refuses tampered ones
- 📜 `duel story` — full match narrative, paste-ready for issues
- 🏆 `duel run --best N` — series with side swaps and advancing seeds
- 🤖 `bots/adapt.mjs` — history-aware counter bot (tops the sample ladder)
- 🐛 batched keystrokes scanned in the spectator loop; agent spawn failures degrade to jabs instead of crashing

## 0.1.0

- initial release: clash/1 engine, any-executable agents, spectator TUI, ELO ladder, replay verification, zero dependencies
