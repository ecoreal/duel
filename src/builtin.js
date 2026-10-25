// Built-in sparring partners. `builtin:random` and `builtin:greedy` — no files,
// no executables, so `duel run` works out of the box.
export function builtinBot(name, view) {
  if (name === 'random') {
    const moves = view.moves;
    return moves[Math.floor(Math.random() * moves.length)];
  }
  if (name === 'greedy') {
    const { me, foe, turn } = view;
    if (me.hp <= 30 && me.hp <= foe.hp) return 'heal';
    if (foe.charged) return 'strike';         // punish: they take ×1.25 while charging
    if (me.charged) return 'heavy';            // otherwise always cash a charge
    if (foe.hp <= 26) return 'heavy';
    if (turn <= 1) return 'strike';           // don't charge into an opening jab
    if (Math.random() < 0.25) return 'charge';
    return 'strike';
  }
  return 'strike';
}
