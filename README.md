# ⚔ duel

**A deterministic AI-agent arena in your terminal. Any executable can fight. Every match is a replayable file.**

```
⚔ duel · seed 42 · turn 12/12 random WINS

greedy  KO                            ┃random
  \|/ *charged*                       ┃  \O/
   x_x                                ┃   |
  / \                                 ┃  / \
░░░░░░░░░░░░░░   0/100                ┃███████████░░░  80/100

T 9 greedy heals 8 · random strikes for 21
T10 greedy heals 13 · random heals 8
T11 greedy heals 10 · random unleashes HEAVY for 25
T12 greedy heals 9 · random unleashes HEAVY for 20
```

*Yes — at seed 42, the random bot still beats greedy. Chaos remains a strategy.*

## 60-second demo

```bash
git clone https://github.com/ecoreal/duel && cd duel
duel run bots/greedy.mjs builtin:random --seed 42   # npx duel-arena after publish
duel watch duel-42.json                            # spectate, frame by frame
```

## The idea

You have agents. Other people have agents. Stop benchmarking them with vibes —
**make them fight in a game where luck is a seeded variable you control.**

- `clash/2` (current) — both fighters get 100 HP and four moves: `strike` (10–16), `heavy` (18–26, 20% self-recoil), `heal` (8–14), `charge` (next attack ×1.5 — **but you take ×1.25 damage while charging**). Simultaneous turns, no first-player advantage, 40-turn limit. Balance tuned over 500-seed simulations (`scripts/sim.mjs`): no pure strategy exceeds ~72% against any other. `clash/1` (v0.1.0 rules) replays still verify — a replay is forever.
- **An agent is any executable.** It receives the match state as JSON on stdin and prints `{"move":"strike"}` on stdout. Four lines of bash can fight. So can an LLM. So can yourragiest regex.
- **Deterministic engine** — splitmix32 PRNG, no `Math.random` in the engine. Same seed + same moves = byte-identical match. Argue about outcomes with receipts, not screenshots.
- **Matches are files.** A replay is ~2 KB of JSON (seed + moves). Share it like a gist; anyone can re-simulate and spectate. `duel` verifies replays by re-simulating them.
- **ELO ladder** — `duel ladder a b c ...` runs a double round-robin (sides swapped) and maintains `ladder.json`.

## Why not just...?

| alternative | the problem |
|---|---|
| LLM leaderboards | static benchmarks; can't watch, can't replay, can't add *your* agent |
| Elo bots on websites | accounts, uptime, someone else's rules |
| writing your own harness | a weekend of glue before the first fun match |

## Agent protocol (the whole thing)

```
stdin  → {"game":"clash/1","turn":3,"me":{"hp":72,"charged":true},"foe":{...},"rules":{...},"history":[...]}
stdout ← {"move":"strike"}        # 1.5s default; timeout = a jab (strike)
```

Sample bots ship in `bots/`: `random.sh` (4 lines of bash), `greedy.mjs` (readable strategy), `adapt.mjs` (reads foe history, counters it), `patient.mjs` (beats adapt 72% — see #1 for the eval-driven story), `llm.mjs` (any OpenAI-compatible endpoint, use `--timeout 10000`). Built-in sparring partners: `builtin:random`, `builtin:greedy` — zero setup.

## CLI

```
duel run <A> <B> [--seed N] [--best 3] [--timeout MS] [--json]
duel watch <replay.json>        # space pause · ←/→ step · +/- speed
duel story <replay.json>        # full match narrative, paste-ready
duel adopt <gist-url|file>      # import + verify a replay; fight its ghost
duel frame <replay.json> [turn] # headless render (--plain) — CI & README-friendly
duel ladder <A> <B> [...]       # double round-robin → ELO table + ladder.json
duel bots                       # where the sample bots live
```

## MVP scope (v0.1) — deliberately tiny

**In:** one game (`clash/1`), executable-agent protocol, deterministic engine + replay verify, spectator TUI, ELO ladder, three sample bots.

**Out (on purpose):** network play, matchmaking server, multiple games, tournament brackets, web UI. The engine interface (`play(seed, movesA, movesB)`) is deliberately game-agnostic — game #2 proves it.

## Tech stack & why

| choice | reason |
|---|---|
| Node.js ≥ 18, ESM | everyone has it; agents in any language via stdin/stdout |
| **0 runtime dependencies** | `git clone` and play; nothing to audit |
| plain ANSI rendering | works over SSH, in CI logs, in a README (see above) |
| `node:test` | `npm test`, zero config |

## Roadmap

- ~~v0.2: submit/adopt~~ ✅ **shipped** — `duel adopt <gist>`, then `duel ladder ghost:adopted.json:0 builtin:greedy` — fight the recording in your own ladder.
- v0.3: game #2 (`tugline`, a positioning duel) and best-of-N matches with pick/ban.
- v0.4: `duel stream` — live spectate a match as it happens; GIF export for the timeline.

## Contributing

Best PRs for v0.1: **new bots** (drop a file in `bots/`, any language) and new render themes. Especially welcome: a bot that reliably beats `greedy#2`.

MIT © 2026 duel contributors
