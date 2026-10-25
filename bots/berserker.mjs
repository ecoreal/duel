#!/usr/bin/env node
// ⚔️ berserker: never heals. Heavy from strength, strikes otherwise.
// eval vs adapt (20 games, seed 700): berserker 70% · adapt 15% · draws 15%.
// Rage, it turns out, IS a strategy against a tempo bot — heavies punish its
// heal turns. See `duel eval bots/berserker.mjs bots/adapt.mjs --games 20`.
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
