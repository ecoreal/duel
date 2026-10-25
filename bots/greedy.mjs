#!/usr/bin/env node
// 🧠 greedy: a readable strategy bot. The whole protocol in ~15 lines —
// read the state JSON from stdin, print {"move": ...} to stdout.
let s = '';
process.stdin.on('data', d => (s += d));
process.stdin.on('end', () => {
  const { me, foe, turn } = JSON.parse(s);
  const move =
    me.hp <= 25 && me.hp <= foe.hp ? 'heal' :
    !me.charged && turn <= 2 ? 'charge' :
    me.charged && foe.hp <= 30 ? 'heavy' :
    !me.charged && Math.random() < 0.3 ? 'charge' :
    'strike';
  process.stdout.write(JSON.stringify({ move }));
});
