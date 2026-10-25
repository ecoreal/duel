// clash/1 — the deterministic duel engine.
// Same seed + same move lists => byte-identical log. Math.random is banned here.
export const MAX_HP = 100;
export const MAX_TURNS = 40;
export const CHARGE_MULT = 1.8;

export const MOVES = {
  strike: { min: 10, max: 16 },                       // reliable damage
  heavy: { min: 18, max: 26, recoilChance: 0.2, recoil: 5 }, // high risk
  heal: { min: 8, max: 14 },                          // back to full? no — cap at MAX_HP
  charge: {},                                         // next strike/heavy ×1.8
};

// splitmix32 — tiny, good enough, seedable
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x9e3779b9) | 0;
    let t = Math.imul(a ^ (a >>> 16), 0x21f0aaad);
    t = t ^ Math.imul(t ^ (t >>> 15), 0x735a2d97);
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

export const validMove = m => (typeof m === 'string' && MOVES[m] ? m : 'strike');
const roll = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

// Compute one side's effect against the pre-turn snapshot (simultaneous turns).
function act(att, def, move, rng) {
  const m = MOVES[move];
  if (move === 'heal') return { heal: roll(rng, m.min, m.max) };
  if (move === 'charge') return { charge: true };
  let dmg = roll(rng, m.min, m.max);
  if (att.charged) dmg = Math.floor(dmg * CHARGE_MULT);
  const out = { dmg };
  if (move === 'heavy' && rng() < m.recoilChance) out.recoil = m.recoil;
  return out;
}

export function play(seed, movesA, movesB) {
  const rng = makeRng(seed);
  const hp = [MAX_HP, MAX_HP];
  const charged = [false, false];
  const log = [];
  let winner = null;
  let stop = 'maxturns'; // 'winner' | 'moves' | 'maxturns'

  for (let t = 0; t < MAX_TURNS && !winner; t++) {
    if (movesA[t] == null || movesB[t] == null) { stop = 'moves'; break; }
    const ma = validMove(movesA[t]);
    const mb = validMove(movesB[t]);
    // effects computed from the snapshot: no first-player advantage
    const fxA = act({ charged: charged[0] }, null, ma, rng);
    const fxB = act({ charged: charged[1] }, null, mb, rng);

    // apply heals, then damage & recoil, then charge state
    if (fxA.heal) hp[0] = Math.min(MAX_HP, hp[0] + fxA.heal);
    if (fxB.heal) hp[1] = Math.min(MAX_HP, hp[1] + fxB.heal);
    if (fxA.dmg) hp[1] -= fxA.dmg;
    if (fxB.dmg) hp[0] -= fxB.dmg;
    if (fxA.recoil) hp[0] -= fxA.recoil;
    if (fxB.recoil) hp[1] -= fxB.recoil;
    hp[0] = Math.max(0, hp[0]); hp[1] = Math.max(0, hp[1]);
    charged[0] = ma === 'charge' ? true : ma === 'heal' ? charged[0] : false;
    charged[1] = mb === 'charge' ? true : mb === 'heal' ? charged[1] : false;

    log.push({
      turn: t + 1,
      moves: [ma, mb],
      dmg: [fxA.dmg || 0, fxB.dmg || 0],
      heal: [fxA.heal || 0, fxB.heal || 0],
      recoil: [fxA.recoil || 0, fxB.recoil || 0],
      hp: [hp[0], hp[1]],
      charged: [charged[0], charged[1]],
    });

    if (hp[0] <= 0 && hp[1] <= 0) winner = 'draw';
    else if (hp[1] <= 0) winner = 'a';
    else if (hp[0] <= 0) winner = 'b';
    if (winner) stop = 'winner';
  }
  if (!winner) winner = hp[0] === hp[1] ? 'draw' : hp[0] > hp[1] ? 'a' : 'b';

  return { seed, log, result: { winner, hp: [hp[0], hp[1]], turns: log.length, stop } };
}

// State an agent sees on its turn. `you` is 0 or 1.
export function agentView(matchLog, you, turn) {
  const last = matchLog[matchLog.length - 1];
  const me = last ? { hp: last.hp[you], charged: last.charged[you] } : { hp: MAX_HP, charged: false };
  const foe = last ? { hp: last.hp[1 - you], charged: last.charged[1 - you] } : { hp: MAX_HP, charged: false };
  return {
    game: 'clash/1',
    turn,
    maxTurns: MAX_TURNS,
    you,
    me,
    foe,
    moves: Object.keys(MOVES),
    rules: { strike: '10-16 dmg', heavy: '18-26 dmg, 20% self-recoil 5', heal: '8-14 hp (cap 100)', charge: `next attack ×${CHARGE_MULT}` },
    history: matchLog.map(l => ({ turn: l.turn, moves: l.moves, hp: l.hp })),
  };
}
