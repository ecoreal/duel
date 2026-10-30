# Changelog

## Unreleased

- 🎲 `duel stream --pickban` — the draft runs before the first blow, live, and the bans land in the replay written at the end (`duel stream` was the one path that skipped the draft).
- 🐛 `bin/duel.js` now turns a bad path into one clean line (`duel: no such file: …`) instead of a node stack trace, matching `tape`.

- 🎲 `--pickban` — a draft before every match, on `run` (single and `--best`), `eval`, `season`, `ladder` and `tournament`. Each side bans one move through the same stdin/stdout pipe (`{"phase":"ban",…}` in, `{"ban":"heavy"}` out), the seed decides who bans first (series alternate it), and a ban removes the move for **both** fighters. Bans are written into the replay (`"bans": [...]`, omitted when empty so old files stay byte-identical) and replayed exactly — drop or edit them and `verifyReplay` fails.
- ⚖ A draft may never remove the last **attack** move (`MOVE_KIND`/`banAllowed`): banning `strike` *and* `heavy` used to leave two fighters healing at each other for 40 turns, so the engine now refuses that second ban instead of handing you a stalemate. `legalBans()` tells an agent what it is actually allowed to remove.
- 🐛 `builtin:` bots (and ghosts) ignored the ban list when choosing a move — they would answer with a banned move and have it silently coerced. They now validate against `view.banned` like every other agent.
- 🧪 61 tests (47 → 61): 14 draft tests (order, determinism, attack-survival, stalemate prevention, malformed/silent/mute bots, ghost behaviour, replay integrity).

- 🪶 `duel gif` writes **delta frames** now: pixels identical to the previous frame become transparent (disposal 1), so a replay's static arena — names, hp bars, borders — is only paid for once. 13-frame clash film: 37.0 KB → 19.8 KB; 31-frame rope film: 99 KB → 47.9 KB. `--no-diff` keeps the old full frames. Composites are byte-identical (tested by compositing both encodings).

- 🎬 `duel stream <A> <B>` — live spectating: the arena frame is redrawn the moment both agents answer, not after the match is over. On a TTY it redraws in place (cursor hidden and restored, even on ctrl-c); piped, it emits one stable line per turn (`T07 greedy heals 9 · berserker HEAVY 24 · hp 46:71`), with `--every N` full frames for CI logs. `--delay`, `--cols/--rows`, `--out` (default `duel-<seed>-live.json`). `duel stream <replay.json>` streams a finished match instead. Mid-match frames show the real turn horizon (`turn 4/30`), never a premature winner — that bug only existed for the five minutes it took to find it.
- 🎞 `duel gif <replay> [--out f.gif]` — a whole match as an animated GIF: one frame per turn via the same `renderFrame()` the TUI uses, rasterized with a hand-drawn 5×7 bitmap font and encoded by a hand-written GIF89a/LZW encoder (`src/gif.js`, `src/pixels.js`, `src/film.js`). Zero deps, no font files, no browser. `--frames` samples long matches (always keeping the opening bell and the finish), `--cols/--rows`, `--scale`, `--delay`. Deterministic: same replay in, byte-identical GIF out.
- 🧪 44 tests (30 → 44): 8 film/GIF (determinism, verdict colour, sampling, empty matches) + 6 stream (turn-per-line, in-place redraw, onTurn ordering, replay integrity, no premature verdicts).

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
