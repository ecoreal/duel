// The deterministic duel engine.
// Same seed + same move lists + same ruleset => byte-identical log.
export const MAX_HP = 100;
export const MAX_TURNS = 40;

// clash/1 — v0.1.0 ruleset (charge ×1.8; kept so old replays verify forever)
// clash/2 — balanced ruleset tuned over 500-seed experiments (scripts/sim.mjs):
//   ×1.8 let a pure charge/heavy loop win 92% vs everything, so charging now
//   multiplies ×1.5 BUT leaves you open: damage taken while charging ×1.25.
export const GAMES = {
  'clash/1': { chargeMult: 1.8 },
  'clash/2': { chargeMult: 1.5, chargeOpening: 1.25 },
};
export const DEFAULT_GAME = 'clash/2';
export const CHARGE_MULT = GAMES[DEFAULT_GAME].chargeMult;

export const MOVES = {
  strike: { min: 10, max: 16 },                       // reliable damage
  heavy: { min: 18, max: 26, recoilChance: 0.2, recoil: 5 }, // high risk
  heal: { min: 8, max: 14 },                          // back to full? no — cap at MAX_HP
  charge: {},                                         // next strike/heavy ×chargeMult
};
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
function act(att, def, move, rng, mult) {
  const m = MOVES[move];
  if (move === 'heal') return { heal: roll(rng, m.min, m.max) };
  if (move === 'charge') return { charge: true };
  let dmg = roll(rng, m.min, m.max);
  if (att.charged) dmg = Math.floor(dmg * mult);
  const out = { dmg };
  if (move === 'heavy' && rng() < m.recoilChance) out.recoil = m.recoil;
  return out;
}

export function play(seed, movesA, movesB, gameId = DEFAULT_GAME) {
  const rules = GAMES[gameId] || GAMES[DEFAULT_GAME];
  const mult = rules.chargeMult;
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
    const fxA = act({ charged: charged[0] }, null, ma, rng, mult);
    const fxB = act({ charged: charged[1] }, null, mb, rng, mult);

    // heals apply first, then damage & recoil — and charging leaves you open
    if (fxA.heal) hp[0] = Math.min(MAX_HP, hp[0] + fxA.heal);
    if (fxB.heal) hp[1] = Math.min(MAX_HP, hp[1] + fxB.heal);
    if (fxA.dmg && mb === 'charge' && rules.chargeOpening) fxA.dmg = Math.floor(fxA.dmg * rules.chargeOpening);
    if (fxB.dmg && ma === 'charge' && rules.chargeOpening) fxB.dmg = Math.floor(fxB.dmg * rules.chargeOpening);
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
export function agentView(matchLog, you, turn, gameId = DEFAULT_GAME) {
  const rules = GAMES[gameId] || GAMES[DEFAULT_GAME];
  const mult = rules.chargeMult;
  const last = matchLog[matchLog.length - 1];
  const me = last ? { hp: last.hp[you], charged: last.charged[you] } : { hp: MAX_HP, charged: false };
  const foe = last ? { hp: last.hp[1 - you], charged: last.charged[1 - you] } : { hp: MAX_HP, charged: false };
  const chargeRule = rules.chargeOpening
    ? `next attack ×${mult}, but you take ×${rules.chargeOpening} damage while charging`
    : `next attack ×${mult}`;
  return {
    game: gameId,
    turn,
    maxTurns: MAX_TURNS,
    you,
    me,
    foe,
    moves: Object.keys(MOVES),
    rules: { strike: '10-16 dmg', heavy: '18-26 dmg, 20% self-recoil 5', heal: '8-14 hp (cap 100)', charge: chargeRule },
    history: matchLog.map(l => ({ turn: l.turn, moves: l.moves, hp: l.hp })),
  };
}
