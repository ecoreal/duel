// Built-in sparring partners. `builtin:random` and `builtin:greedy` — no files,
// no executables, so `duel run` works out of the box. Every bot reads whatever
// agentView hands it, so `random` plays any game (clash or rope) for free.
export function builtinBot(name, view) {
  if (name === 'random') {
    const moves = view.moves; // agentView lists the current game's legal moves
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
  // rope/1: greedy tug — keep pulling while the tank holds, refill before it
  // runs dry, and cash a lunge when the foe is too gassed to punish it.
  if (name === 'rope-greedy') {
    const { me, foe } = view;
    if (me.stamina >= 7 && foe.stamina <= 2) return 'lunge';
    if (me.stamina < 3) return 'rest';
    return 'haul';
  }
  return 'strike';
}
