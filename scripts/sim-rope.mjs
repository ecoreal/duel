#!/usr/bin/env node
// Balance simulator for rope/1: pure strategies × N seeded matches, pure engine
// math. Run: node scripts/sim-rope.mjs [matches=500]
//
// Every strategy only sees what an agent sees (agentView): knot, stamina,
// foeStamina, turn. No Math.random — makeRng keeps the whole matrix reproducible.
import { play, agentView, makeRng, ROPE_MAX_TURNS } from '../src/engine.js';

const N = Number(process.argv[2]) || 500;

// strategy: (me, foe, turn, rng) => move
const STRATS = {
  // always pull cheap — the "just pull" baseline the rules must punish
  hauler: () => 'haul',
  // burst pulls whenever the tank allows, refill otherwise
  lunger: me => (me.stamina >= 4 ? 'lunge' : 'rest'),
  // literal rest-then-haul: top the tank off, pull at full
  'rest-haul': me => (me.stamina < 10 ? 'rest' : 'haul'),
  // pure wall: brace everything, produce nothing
  leaner: () => 'lean',
  // the shipped builtin: haul, refill before empty, lunge a gassed foe
  'rope-greedy': (me, foe) => {
    if (me.stamina >= 7 && foe.stamina <= 2) return 'lunge';
    if (me.stamina < 3) return 'rest';
    return 'haul';
  },
  // brace against a loaded foe, cash a lunge into a tired one
  counter: (me, foe) => {
    if (foe.stamina >= 4) return 'lean';
    if (me.stamina >= 4) return 'lunge';
    return 'rest';
  },
  // seeded noise, like builtin:random
  random: (_me, _foe, _turn, rng) => ['haul', 'lunge', 'lean', 'rest'][Math.floor(rng() * 4)],
};

// play() consumes full move lists, so we generate moves turn by turn against
// the engine's own log (same trick as scripts/sim.mjs — no shadow-state drift).
function simulate(nameA, nameB, seed) {
  const rngA = makeRng(seed * 2 + 1);
  const rngB = makeRng(seed * 2 + 2);
  const A = [], B = [];
  const strat = (name, view, rng) => STRATS[name](view.me, view.foe, view.turn, rng);
  for (let t = 1; t <= ROPE_MAX_TURNS; t++) {
    const sim = play(seed, A, B, 'rope/1');
    if (sim.result.stop !== 'moves') return { winner: resultOf(sim), turns: sim.result.turns };
    const va = agentView(sim.log, 0, t, 'rope/1');
    const vb = agentView(sim.log, 1, t, 'rope/1');
    A.push(strat(nameA, va, rngA));
    B.push(strat(nameB, vb, rngB));
  }
  return { winner: resultOf(play(seed, A, B, 'rope/1')), turns: ROPE_MAX_TURNS };
}
const resultOf = sim => sim.result.winner; // 'a' | 'b' | 'draw' (a is the row player here)

const names = Object.keys(STRATS);
console.log(`rope/1 matchups over ${N} seeds (rows vs cols, win% for row, draws excluded from the split):\n`);
const header = '             ' + names.map(n => n.padStart(11)).join('');
console.log(header);
let maxCell = { a: '', b: '', pct: 0 };
const cells = {};
for (const a of names) {
  const row = names.map(b => {
    if (a === b) return '          —';
    let w = 0, d = 0, turns = 0;
    for (let s = 1; s <= N; s++) {
      const r = simulate(a, b, s);
      if (r.winner === 'a') w++;
      else if (r.winner === 'draw') d++;
      turns += r.turns;
    }
    const decisive = N - d;
    const pct = decisive ? (100 * w / decisive) : 0;
    cells[`${a}|${b}`] = pct;
    if (pct > maxCell.pct) maxCell = { a, b, pct };
    return `${pct.toFixed(0)}%`.padStart(10) + '';
  });
  console.log(a.padEnd(12) + ' ' + row.join(' '));
}
console.log(`\nheadlines:`);
console.log(`  hauler vs rest-haul   ${cells['hauler|rest-haul'].toFixed(1)}%  (bar: <= ~70%)`);
console.log(`  max decisive winrate  ${maxCell.a} vs ${maxCell.b}: ${maxCell.pct.toFixed(1)}%`);
