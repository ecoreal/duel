// The deterministic duel engine.
// Same seed + same move lists + same ruleset => byte-identical log.
export const MAX_HP = 100;
export const MAX_TURNS = 40;

// clash/1 — v0.1.0 ruleset (charge ×1.8; kept so old replays verify forever)
// clash/2 — balanced ruleset tuned over 500-seed experiments (scripts/sim.mjs):
//   ×1.8 let a pure charge/heavy loop win 92% vs everything, so charging now
//   multiplies ×1.5 BUT leaves you open: damage taken while charging ×1.25.
export const GAMES = {
  'clash/1': {
    chargeMult: 1.8,
    blurb: [
      'charge ×1.8 (v0.1.0 ruleset, frozen so old replays verify forever)',
      'moves: strike 10-16 · heavy 18-26 (20% recoil 5) · heal 8-14 (cap 100) · charge → ×1.8 next attack',
      '100 HP · simultaneous turns · 40-turn limit · HP compare decides at the limit',
    ],
  },
  'clash/2': {
    chargeMult: 1.5,
    chargeOpening: 1.25,
    blurb: [
      'charge ×1.5 · opening ×1.25 (damage taken while charging)',
      'moves: strike 10-16 · heavy 18-26 (20% recoil 5) · heal 8-14 (cap 100) · charge → ×1.5 next attack',
      '100 HP · simultaneous turns · 40-turn limit · HP compare decides at the limit',
    ],
  },
  // rope/1 — game #2, proves the engine interface is game-agnostic (v0.3).
  // Tug of war on a 13-cell rope: the knot's offset from center IS the state.
  //   knot -6 … 0 (start) … +6 — +6 is A's edge, -6 is B's edge.
  // Both fighters start with 10 stamina (cap 10). Moves, simultaneous:
  //   haul  — pull the knot 1 toward your edge, costs 3 stamina.
  //           15% slip (makeRng): the knot moves 1 the OTHER way instead.
  //   lunge — pull the knot 2 toward your edge, costs 4 (needs stamina ≥ 4).
  //           Same 15% slip, doubled stakes: a slipped lunge moves the knot 2
  //           the other way. Per stamina it out-pulls a haul (1.4/4 vs 0.7/3),
  //           but it is slow to cycle and a leaning foe halves it to 1.
  //   lean  — brace, costs nothing: the foe's pull this turn arrives at half
  //           strength (haul 1 → 0.5, lunge 2 → 1, slipped pulls included).
  //   rest  — +3 stamina (capped at 10).
  // Invalid move strings coerce to `haul`; unaffordable haul/lunge coerce to
  // `rest` (both deterministic, no RNG). One rng() roll per pull, A first —
  // leans and rests never touch the RNG.
  // Win: knot reaches +6 (A) / -6 (B), else after 30 turns the side the knot
  // leans toward wins (knot 0 → draw).
  // Balance — scripts/sim-rope.mjs, 1000-seed matrix (win% for row, draws
  // excluded). Tuned away from the first draft in two places, both economy:
  //   haul 2→3 stamina: at 2 the sustained haul rate (60%) beat the cap-limited
  //     rest-then-haul (50%) by a full knot — haul-only won 82%, now 58%.
  //   lunge slips too (for 2): a no-slip lunge swept every naive strategy at
  //     100%; the lean-counter now holds it to 68%.
  //   hauler vs rest-haul 58% · lunger vs hauler 90% (but counter 68%) ·
  //   counter vs hauler 85% · rest-haul vs counter 100% — a full
  //   rock-paper-scissors cycle: every naive strategy has a predator.
  'rope/1': {
    rope: true,
    maxTurns: 30,
    knotLimit: 6,
    staminaMax: 10,
    slip: 0.15,
    blurb: [
      'tug of war — knot starts 0 on a 13-cell rope; +6 = A wins, -6 = B wins',
      'moves: haul (knot 1 your way, 3 stamina, 15% slip) · lunge (knot 2, 4 stamina, 15% slip for 2) · lean (halve the foe\'s pull) · rest (+3 stamina)',
      '10 stamina, cap 10 · simultaneous turns · 30-turn limit · the knot\'s side wins at the limit (0 = draw)',
    ],
  },
};
export const DEFAULT_GAME = 'clash/2';
export const CHARGE_MULT = GAMES[DEFAULT_GAME].chargeMult;

// rope/1 constants (mirrored into GAMES['rope/1'] so `duel rules` can print them)
export const ROPE_MAX_TURNS = 30;
export const ROPE_KNOT_LIMIT = 6;
export const ROPE_STAMINA_MAX = 10;
export const ROPE_SLIP = 0.15;
export const ROPE_MOVES = {
  haul: { cost: 3, pull: 1, slip: ROPE_SLIP },   // cheap pull, may slip
  lunge: { cost: 4, pull: 2, slip: ROPE_SLIP },  // committed pull: slips for 2
  lean: { cost: 0 },                             // brace: foe's pull ×0.5
  rest: { cost: -3 },                            // +3 stamina (cap below)
};

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

// Per-game move validation + defaults. Unknown games fall back to clash moves.
export const validMove = (m, gameId = DEFAULT_GAME) => {
  if (GAMES[gameId]?.rope) return (typeof m === 'string' && ROPE_MOVES[m]) ? m : 'haul';
  return (typeof m === 'string' && MOVES[m]) ? m : 'strike';
};
export const defaultMove = gameId => (GAMES[gameId]?.rope ? 'haul' : 'strike');
export const maxTurnsFor = gameId => GAMES[gameId]?.maxTurns ?? MAX_TURNS;

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

// clash turn step — FROZEN MATH (clash/1 + clash/2 replay compatibility).
// Do not touch RNG consumption, ordering or rounding here.
function playClash(seed, movesA, movesB, gameId) {
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

// rope/1 turn step — the whole game is the knot's offset from center.
// Snapshot semantics like clash: both moves validate against pre-turn stamina,
// then forces resolve (A's slip roll first). Knot sits on a 0.5 grid because
// lean halves pulls; it is clamped to the rope's 13 cells [-6, +6].
function playRope(seed, movesA, movesB) {
  const rules = GAMES['rope/1'];
  const rng = makeRng(seed);
  const stamina = [ROPE_STAMINA_MAX, ROPE_STAMINA_MAX];
  const log = [];
  let knot = 0;
  let winner = null;
  let stop = 'maxturns'; // 'winner' | 'moves' | 'maxturns'

  // validate against the snapshot: unknown move → haul (the jab of rope),
  // unaffordable haul/lunge → rest. No RNG involved.
  const coerce = (m, s) => {
    const move = (typeof m === 'string' && ROPE_MOVES[m]) ? m : 'haul';
    if (move === 'haul' && s < ROPE_MOVES.haul.cost) return 'rest';
    if (move === 'lunge' && s < ROPE_MOVES.lunge.cost) return 'rest';
    return move;
  };

  for (let t = 0; t < rules.maxTurns && !winner; t++) {
    if (movesA[t] == null || movesB[t] == null) { stop = 'moves'; break; }
    const ma = coerce(movesA[t], stamina[0]);
    const mb = coerce(movesB[t], stamina[1]);

    // stamina is per-side and independent: costs and rest apply from the snapshot
    stamina[0] = Math.max(0, Math.min(ROPE_STAMINA_MAX, stamina[0] - ROPE_MOVES[ma].cost));
    stamina[1] = Math.max(0, Math.min(ROPE_STAMINA_MAX, stamina[1] - ROPE_MOVES[mb].cost));

    // forces in A-units (+ = toward A's edge); one slip roll per pull (haul or
    // lunge), A first. Leans and rests never touch the RNG.
    const pull = [0, 0];
    const slipped = [false, false];
    for (const [i, move] of [[0, ma], [1, mb]]) {
      const spec = ROPE_MOVES[move];
      if (!spec.pull) continue; // lean/rest pull nothing
      const dir = i === 0 ? 1 : -1;
      if (spec.slip && rng() < spec.slip) { slipped[i] = true; pull[i] = -spec.pull * dir; }
      else pull[i] = spec.pull * dir;
    }
    // lean braces: whatever the foe pulls (even a lucky slip) arrives halved
    if (mb === 'lean') pull[0] /= 2;
    if (ma === 'lean') pull[1] /= 2;

    const delta = pull[0] + pull[1];
    knot = Math.max(-ROPE_KNOT_LIMIT, Math.min(ROPE_KNOT_LIMIT, knot + delta));

    log.push({
      turn: t + 1,
      moves: [ma, mb],
      knot,
      stamina: [stamina[0], stamina[1]],
      slipped,
      delta,
    });

    if (knot >= ROPE_KNOT_LIMIT) { winner = 'a'; stop = 'winner'; }
    else if (knot <= -ROPE_KNOT_LIMIT) { winner = 'b'; stop = 'winner'; }
  }
  if (!winner) winner = knot > 0 ? 'a' : knot < 0 ? 'b' : 'draw';

  return { seed, log, result: { winner, knot, turns: log.length, stop } };
}

// Per-game dispatch: each game owns its step function. clash/1 + clash/2 share
// the frozen playClash; anything unrecognized falls back to it (old behavior).
export function play(seed, movesA, movesB, gameId = DEFAULT_GAME) {
  if (gameId === 'rope/1') return playRope(seed, movesA, movesB);
  return playClash(seed, movesA, movesB, gameId);
}

// State an agent sees on its turn. `you` is 0 or 1.
export function agentView(matchLog, you, turn, gameId = DEFAULT_GAME) {
  const rules = GAMES[gameId] || GAMES[DEFAULT_GAME];
  if (rules.rope) {
    const last = matchLog[matchLog.length - 1];
    const knot = last ? last.knot : 0;
    const stamina = last ? last.stamina[you] : ROPE_STAMINA_MAX;
    const foeStamina = last ? last.stamina[1 - you] : ROPE_STAMINA_MAX;
    return {
      game: gameId,
      turn,
      maxTurns: ROPE_MAX_TURNS,
      you,
      knot, // signed, shared: + is side A's edge (you === 0), - is side B's
      stamina,
      foeStamina,
      me: { stamina, dir: you === 0 ? 1 : -1 },  // dir: sign that pulls the knot your way
      foe: { stamina: foeStamina, dir: you === 0 ? -1 : 1 },
      moves: Object.keys(ROPE_MOVES),
      rules: {
        haul: 'knot 1 your way, 3 stamina, 15% slip (knot 1 the other way instead)',
        lunge: 'knot 2 your way, 4 stamina (needs 4+), same 15% slip but the knot moves 2 the other way',
        lean: 'halve the foe\'s pull this turn (haul 1→0.5, lunge 2→1, slips included)',
        rest: '+3 stamina (cap 10)',
        win: `knot +6 (side A) / -6 (side B) ends it; after ${ROPE_MAX_TURNS} turns the knot's side wins (0 = draw)`,
      },
      history: matchLog.map(l => ({ turn: l.turn, moves: l.moves, knot: l.knot })),
    };
  }
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
