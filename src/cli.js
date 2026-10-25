import { play, agentView, MAX_TURNS, DEFAULT_GAME } from './engine.js';
import { askAgent, agentName } from './agent.js';
import { saveReplay, loadReplay, verifyReplay } from './replay.js';
import { runLadder } from './elo.js';
import { renderFrame, vis } from './render.js';
import { watch } from './tui.js';
import { writeFileSync } from 'node:fs';

const VERSION = '0.1.0';
const HELP = `⚔ duel ${VERSION} — a deterministic AI agent arena in your terminal

usage:
  duel run <agentA> <agentB> [--seed N] [--out FILE] [--timeout MS] [--json]
  duel watch <replay.json>            spectate with playback controls
  duel frame <replay.json> [turn]     render one frame to stdout (--plain)
  duel ladder <agent...>              round-robin, ELO table -> ladder.json
  duel bots                           where the sample bots live

an agent is any executable: it reads the match state as JSON on stdin
and prints {"move":"strike|heavy|heal|charge"} on stdout.
built-in opponents: builtin:random  builtin:greedy`;

function parseFlags(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') flags.seed = Number(argv[++i]);
    else if (a === '--game') flags.game = argv[++i];
    else if (a === '--out') flags.out = argv[++i];
    else if (a === '--timeout') flags.timeout = Number(argv[++i]);
    else if (a === '--json') flags.json = true;
    else if (a === '--plain') flags.plain = true;
    else if (a === '--width') flags.width = Number(argv[++i]);
    else if (a === '--height') flags.height = Number(argv[++i]);
    else if (a === '-h' || a === '--help') flags.help = true;
    else flags._.push(a);
  }
  return flags;
}

// Drives the engine turn by turn, asking each agent for its move.
async function runMatch(cmdA, cmdB, { seed, timeout, game = DEFAULT_GAME }) {
  const movesA = [], movesB = [];
  const fails = { a: 0, b: 0 };
  for (let t = 0; t < MAX_TURNS; t++) {
    let sim = play(seed, movesA, movesB, game);
    if (sim.result.stop !== 'moves') break; // already decided
    const [ra, rb] = await Promise.all([
      askAgent(cmdA, agentView(sim.log, 0, t + 1, game), timeout),
      askAgent(cmdB, agentView(sim.log, 1, t + 1, game), timeout),
    ]);
    if (!ra.ok) fails.a++;
    if (!rb.ok) fails.b++;
    movesA.push(ra.move); movesB.push(rb.move);
  }
  return { seed, movesA, movesB, fails, game };
}

export async function main(argv) {
  const [cmd, ...rest] = argv;
  const flags = parseFlags(rest);
  if (!cmd || flags.help) { console.log(HELP); process.exitCode = cmd ? 0 : 1; return; }

  if (cmd === 'bots') {
    console.log(`sample bots ship with the repo:
  bots/random.sh    — 4 lines of bash
  bots/greedy.mjs   — a deterministic strategy in plain JS
  bots/llm.mjs      — an LLM fighter (needs an API key, use --timeout 8000)
try: duel run bots/greedy.mjs builtin:random --seed 7`);
    return;
  }

  if (cmd === 'run') {
    const [a, b] = flags._;
    if (!a || !b) { console.error('duel run: need two agents\n' + HELP); process.exitCode = 1; return; }
    const seed = flags.seed ?? (Date.now() & 0x7fffffff);
    const timeout = flags.timeout ?? 1500;
    const game = flags.game || DEFAULT_GAME;
    const { movesA, movesB, fails } = await runMatch(a, b, { seed, timeout, game });
    const players = [{ name: agentName(a) }, { name: agentName(b) }];
    const out = flags.out || `duel-${seed}.json`;
    const replay = saveReplay(out, { seed, players, movesA, movesB, game });
    if (!verifyReplay(replay)) console.error('warning: replay failed integrity check');
    if (flags.json) { console.log(JSON.stringify({ ...replay, log: undefined })); return; }
    const { result } = replay;
    const verdict = result.winner === 'draw' ? 'draw' : `${(result.winner === 'a' ? players[0] : players[1]).name} wins`;
    console.log(`⚔ ${players[0].name} vs ${players[1].name} · seed ${seed} · ${result.turns} turns`);
    console.log(`   ${verdict} — hp ${result.hp[0]}:${result.hp[1]}${result.stop === 'maxturns' ? ' (turn limit)' : ''}`);
    const hesitations = Object.entries(fails).filter(([, n]) => n > 0).map(([side, n]) => `${(side === 'a' ? players[0] : players[1]).name}: ${n} jab${n === 1 ? '' : 's'} (invalid/late move)`);
    if (hesitations.length) console.log(`   ⚠ ${hesitations.join(' · ')}`);
    console.log(`💾 replay → ${out}   spectate: duel watch ${out}`);
    return;
  }

  if (cmd === 'watch') {
    const [file] = flags._;
    if (!file) { console.error('duel watch: need a replay file'); process.exitCode = 1; return; }
    await watch(loadReplay(file), renderFrame);
    return;
  }

  if (cmd === 'frame') {
    const [file, turnArg] = flags._;
    if (!file) { console.error('duel frame: need a replay file'); process.exitCode = 1; return; }
    const replay = loadReplay(file);
    const turn = turnArg != null ? Math.max(0, Math.min(replay.result.turns, Number(turnArg))) : replay.result.turns;
    const lines = renderFrame({ replay, turn, w: flags.width || 80, h: flags.height || 24 });
    console.log(lines.map(l => (flags.plain ? vis(l) : l)).join('\n'));
    return;
  }

  if (cmd === 'ladder') {
    const cmds = flags._;
    if (cmds.length < 2) { console.error('duel ladder: need at least two agents'); process.exitCode = 1; return; }
    const agents = cmds.map(c => ({ name: agentName(c), cmd: c }));
    // same-name agents would merge in the ratings map — disambiguate
    const seen = new Map();
    for (const a of agents) {
      const n = seen.get(a.name) ?? 0;
      seen.set(a.name, n + 1);
      if (n > 0) a.name = `${a.name}#${n + 1}`;
    }
    const seedBase = flags.seed ?? 1000;
    const timeout = flags.timeout ?? 1500;
    let matchCount = 0;
    const { table, matches } = await runLadder(agents, async (A, B) => {
      const seed = seedBase + matchCount++;
      const { movesA, movesB } = await runMatch(A.cmd, B.cmd, { seed, timeout });
      const { result } = play(seed, movesA, movesB);
      return { winner: result.winner, turns: result.turns, seed };
    });
    writeFileSync('ladder.json', JSON.stringify({ updated: new Date().toISOString(), table, matches }, null, 2));
    console.log('rank agent               elo    w  l  d');
    table.forEach((r, i) => console.log(`${String(i + 1).padStart(4)} ${r.name.padEnd(20)} ${String(r.rating).padStart(6)}  ${String(r.w).padStart(2)} ${String(r.l).padStart(2)} ${String(r.d).padStart(2)}`));
    console.log('\n💾 ladder → ladder.json');
    return;
  }

  console.log(HELP);
  process.exitCode = 1;
}
