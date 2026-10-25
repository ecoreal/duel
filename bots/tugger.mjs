#!/usr/bin/env node
// ⚓ tugger — a readable rope/1 bot: brace when behind, grind when ahead.
// The state you get on stdin: knot (shared, + is side A's edge — multiply by
// me.dir to make it "yours"), your stamina, foeStamina. Strategy:
//   rest  below 3 stamina  — nothing pulls on an empty tank
//   lunge to close out     — knot ≥ 4 your way costs 4, but 2 cells can end it
//   lean  when behind      — you pull nothing, but the foe's pull arrives halved
//   haul  otherwise        — level or ahead: the cheap 1-cell grind
// Honest eval vs builtin:rope-greedy (20 games, seed 950, sides swapped):
//   node bin/duel.js eval bots/tugger.mjs builtin:rope-greedy --game rope/1 --games 20 --seed 950
//   tugger 25.0% · rope-greedy 70.0% · draws 5.0%
// Losing honestly to the builtin is the lesson: lean pulls NOTHING, so once a
// slip puts you behind you brace forever at full stamina while a tireless
// hauler grinds the knot away (see any loss: lean → knot −0.5/turn → edge).
// It's here to be read and stolen from, not to top the ladder.
let s = '';
process.stdin.on('data', d => (s += d));
process.stdin.on('end', () => {
  const { knot, stamina, me } = JSON.parse(s);
  const mine = knot * me.dir;              // + = the knot is on OUR side of center
  const move =
    stamina < 3 ? 'rest' :                 // gassed: refill before anything else
    mine >= 4 && stamina >= 5 ? 'lunge' :  // knot near their edge: cash 2 cells for the win
    mine < 0 ? 'lean' :                    // knot against us: brace, halve their pull
    'haul';                                // level or ahead: keep grinding
  process.stdout.write(JSON.stringify({ move }));
});
