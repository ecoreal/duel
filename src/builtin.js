// Built-in sparring partners. `builtin:random` and `builtin:greedy` — no files,
// no executables, so `duel run` works out of the box.
export function builtinBot(name, view) {
  if (name === 'random') {
    const moves = view.moves;
    return moves[Math.floor(Math.random() * moves.length)];
  }
  if (name === 'greedy') {
    const { me, foe, turn } = view;
    if (me.hp <= 25 && me.hp <= foe.hp) return 'heal';
    if (!me.charged && turn <= 2) return 'charge';
    if (me.charged && foe.hp <= 30) return 'heavy';
    if (!me.charged && Math.random() < 0.3) return 'charge';
    return 'strike';
  }
  return 'strike';
}
