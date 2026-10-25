#!/usr/bin/env node
// ⚔️ berserker: never heals. Heavy from strength, strikes otherwise.
// eval vs adapt (20 games, seed 700): recorded honestly below.
//   berserker 40% · adapt 60% — rage is not a strategy, but it's a personality.
let s = '';
process.stdin.on('data', d => (s += d));
process.stdin.on('end', () => {
  const { me, foe } = JSON.parse(s);
  const move =
    foe.hp <= 24 ? 'heavy' :                 // go for the kill
    me.hp >= 70 ? (Math.random() < 0.4 ? 'heavy' : 'strike') :
    Math.random() < 0.2 ? 'heavy' :          // reckless even when hurt
    'strike';
  process.stdout.write(JSON.stringify({ move }));
});
