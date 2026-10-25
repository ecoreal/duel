#!/usr/bin/env node
// 🧊 patient — the answer to duel#1: beats adapt.mjs 65-70%.
// Insight (found via `duel eval`): adapt ALWAYS punishes a charging foe
// with a strike. That determinism is exploitable — charge freely, eat the
// ×1.25 jab (16.25 avg), cash the ×1.5 heavy (33 avg): net +16 per cycle.
// Heal only when truly low; finishers when they're nearly done.
let s = '';
process.stdin.on('data', d => (s += d));
process.stdin.on('end', () => {
  const { me, foe } = JSON.parse(s);
  const move =
    foe.hp <= 24 ? 'heavy' :               // finisher
    me.hp <= 35 ? 'heal' :                 // stay out of burst range
    me.charged ? 'heavy' :                 // cash the charge
    'charge';                              // they'll only ever jab back
  process.stdout.write(JSON.stringify({ move }));
});
