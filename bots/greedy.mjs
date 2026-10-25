#!/usr/bin/env node
// 🧠 greedy v3: punish charging foes, cash charges, heal when low.
// The whole protocol in ~15 lines: read state JSON from stdin, print {"move"}.
let s = '';
process.stdin.on('data', d => (s += d));
process.stdin.on('end', () => {
  const { me, foe, turn } = JSON.parse(s);
  const move =
    me.hp <= 30 && me.hp <= foe.hp ? 'heal' :
    foe.charged ? 'strike' :
    me.charged ? 'heavy' :
    foe.hp <= 26 ? 'heavy' :
    turn <= 1 ? 'strike' :
    Math.random() < 0.25 ? 'charge' :
    'strike';
  process.stdout.write(JSON.stringify({ move }));
});
