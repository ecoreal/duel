#!/usr/bin/env node
// Balance simulator: pure strategies × N seeded matches, pure engine math.
// Run: node scripts/sim.mjs [matches=1000]
import { play } from '../src/engine.js';

const N = Number(process.argv[2]) || 1000;

// strategy: (me, foe, turn) => move — mirrors what an agent can see
const STRATS = {
  random: (me, foe, turn) => ['strike', 'heavy', 'heal', 'charge'][Math.floor(Math.random() * 4)],
  jabber: () => 'strike',
  healer: () => 'heal',
  charger: (me) => (me.charged ? 'heavy' : 'charge'),
  greedy: (me, foe, turn) => {
    if (me.hp <= 30 && me.hp <= foe.hp) return 'heal';
    if (foe.charged) return 'strike';
    if (me.charged) return 'heavy';
    if (foe.hp <= 26) return 'heavy';
    if (turn <= 1) return 'strike';
    if (Math.random() < 0.25) return 'charge';
    return 'strike';
  },
};

// play() consumes full move lists, so we generate moves turn by turn against
// a shadow state that tracks hp/charged like the engine does.
function simulate(nameA, nameB, seed) {
  const a = { hp: 100, charged: false }, b = { hp: 100, charged: false };
  const A = [], B = [];
  for (let t = 0; t < 40; t++) {
    const { log, result } = play(seed, A, B);
    if (result.stop !== 'moves') return { winner: result.winner, turns: result.turns };
    // rebuild views from the last log entry
    const last = log[log.length - 1];
    const me = (v) => (v ? { hp: v.hp[0], charged: v.charged[0] } : { hp: 100, charged: false });
    const foe = (v) => (v ? { hp: v.hp[1], charged: v.charged[1] } : { hp: 100, charged: false });
    A.push(STRATS[nameA](me(last), foe(last), t + 1));
    B.push(STRATS[nameB](foe(last), me(last), t + 1));
  }
  const { result } = play(seed, A, B);
  return { winner: result.winner, turns: result.turns };
}

const names = Object.keys(STRATS);
console.log(`matchups over ${N} seeds (rows vs cols, win% for row):\n`);
const header = '           ' + names.map(n => n.padStart(9)).join('');
console.log(header);
for (const a of names) {
  const row = names.map(b => {
    if (a === b) return '      —';
    let w = 0, turns = 0;
    for (let s = 1; s <= N; s++) {
      const r = simulate(a, b, s);
      if (r.winner === 'a') w++;
      turns += r.turns;
    }
    return `${(100 * w / N).toFixed(0)}%`.padStart(8) + '';
  });
  console.log(a.padEnd(10) + ' ' + row.join(' '));
}
