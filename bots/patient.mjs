#!/usr/bin/env node
// 🧊 patient — the answer to duel#1: beats adapt.mjs 64-72% (50-game evals).
// Insight (found via `duel eval`): adapt ALWAYS punishes a charging foe
// with a strike. That determinism is exploitable — charge freely, eat the
// ×1.25 jab (~16), cash the ×1.5 heavy (~33): net positive every cycle.
// Discipline is the whole bot: no finishers, no improvising — the cadence
// IS the win condition. (A "smarter" v3 with a finisher branch dropped to
// 18%: breaking cadence hands adapt its tempo back.)
let s = '';
process.stdin.on('data', d => (s += d));
process.stdin.on('end', () => {
  const { me } = JSON.parse(s);
  const move =
    me.charged ? 'heavy' :      // cash the charge
    me.hp > 35 ? 'charge' :     // they'll only ever jab back
    'heal';                     // stay out of burst range
  process.stdout.write(JSON.stringify({ move }));
});
