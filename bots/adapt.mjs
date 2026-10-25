#!/usr/bin/env node
// 🎭 adapt: reads the opponent's move history and counters it.
//   foe heals a lot   -> pressure (never let them stabilize)
//   foe charges often -> punish the opening (×1.25 damage window)
//   otherwise         -> trade strikes, finish with heavy
// A ~25-line demonstration that the history in the protocol is real.
let s = '';
process.stdin.on('data', d => (s += d));
process.stdin.on('end', () => {
  const { me, foe, you, history } = JSON.parse(s);
  const foeSeq = history.map(h => h.moves[1 - you]);
  const count = m => foeSeq.filter(x => x === m).length;
  const pressure = count('heal') >= Math.max(2, Math.ceil(foeSeq.length * 0.3));
  let move;
  if (me.hp <= 22 && me.hp < foe.hp) move = 'heal';
  else if (foe.charged) move = 'strike';                    // punish the opening
  else if (me.charged) move = 'heavy';
  else if (foe.hp <= 34) move = 'heavy';                    // finisher range
  else if (pressure) move = Math.random() < 0.3 ? 'heavy' : 'strike';
  else if (count('charge') >= 2 && foe.hp < 60) move = 'strike'; // camp a charger
  else move = Math.random() < 0.2 ? 'charge' : 'strike';
  process.stdout.write(JSON.stringify({ move }));
});
