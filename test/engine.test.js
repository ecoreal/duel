import { test } from 'node:test';
import assert from 'node:assert/strict';
import { play, makeRng, MOVES, MAX_TURNS } from '../src/engine.js';
import { saveReplay, verifyReplay } from '../src/replay.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// deterministic move generator (never Math.random in tests)
const genMoves = (seed, n = 40) => {
  const rng = makeRng(seed);
  const keys = Object.keys(MOVES);
  return Array.from({ length: n }, () => keys[Math.floor(rng() * keys.length)]);
};

test('same seed + same moves => byte-identical match', () => {
  const a = play(42, genMoves(1), genMoves(2));
  const b = play(42, genMoves(1), genMoves(2));
  assert.deepEqual(a, b);
  assert.equal(a.result.stop === 'winner' || a.result.stop === 'maxturns', true);
});

test('engine invariants hold over 100 generated matches', () => {
  for (let i = 0; i < 100; i++) {
    const { log, result } = play(i, genMoves(i * 7 + 1), genMoves(i * 7 + 2));
    for (const t of log) {
      for (const hp of t.hp) assert.ok(hp >= 0 && hp <= 100, `hp out of range: ${hp}`);
      assert.ok(t.dmg.every(d => d === 0 || (d >= 10 && d <= Math.floor(26 * 1.5 * 1.25))), `dmg in range: ${t.dmg}`);
    }
    assert.ok(['a', 'b', 'draw'].includes(result.winner));
    assert.ok(result.turns <= MAX_TURNS);
  }
});

test('charge multiplies and is consumed; heal caps at 100', () => {
  // A charges then strikes; B heals both turns (clash/2: ×1.5)
  const { log } = play(3, ['charge', 'strike'], ['heal', 'heal']);
  assert.equal(log[0].moves[0], 'charge');
  assert.ok(log[0].charged[0], 'charge flag set after charging');
  assert.ok(log[1].dmg[0] >= Math.floor(10 * 1.5), `charged strike boosted: ${log[1].dmg[0]}`);
  assert.equal(log[1].charged[0], false, 'charge consumed by attack');

  const spam = play(5, Array(30).fill('heal'), Array(30).fill('strike'));
  for (const t of spam.log) assert.ok(t.hp[0] <= 100);
});

test('clash/1 rules still verify old replays (×1.8), clash/2 differs', () => {
  const A = ['charge', 'strike', 'strike'], B = ['strike', 'strike', 'strike'];
  const v1 = play(7, A, B, 'clash/1');
  const v2 = play(7, A, B, 'clash/2');
  assert.notDeepEqual(v1.log, v2.log, 'rulesets must produce different logs');
  // a clash/1-style replay verifies under clash/1
  const replayLike = { seed: 7, game: 'clash/1', moves: A.map((m, i) => [m, B[i]]), log: v1.log };
  assert.ok(verifyReplay(replayLike));
});

test('charge-opening: damage taken while charging is amplified under clash/2 only', () => {
  // A charges while B strikes — B's hit on A should be >= 10 × 1.25
  const v2 = play(3, ['charge'], ['strike'], 'clash/2');
  assert.ok(v2.log[0].dmg[1] >= Math.floor(10 * 1.25), `amplified: ${v2.log[0].dmg[1]}`);
  const v1 = play(3, ['charge'], ['strike'], 'clash/1');
  assert.ok(v1.log[0].dmg[1] >= 10 && v1.log[0].dmg[1] <= 16, `clash/1 unamplified: ${v1.log[0].dmg[1]}`);
});

test('balance lock: charger does not dominate jabber under clash/2', () => {
  // deterministic strategies — no Math.random. See scripts/sim.mjs for the
  // full matrix; this locks the headline fix (was 99% for charger under ×1.8).
  const charger = me => (me.charged ? 'heavy' : 'charge');
  let jabberWins = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const A = [], B = [];
    let winner = null;
    for (let t = 0; t < 40; t++) {
      const sim = play(seed, A, B, 'clash/2');
      if (sim.result.stop !== 'moves') { winner = sim.result.winner; break; }
      const last = sim.log[sim.log.length - 1] ?? { charged: [false, false] };
      A.push(charger({ charged: last.charged[0] }));
      B.push('strike');
    }
    // 40 turns exhausted with no KO: adjudicate by HP on the complete move lists
    if (!winner) winner = play(seed, A, B, 'clash/2').result.winner;
    if (winner === 'b') jabberWins++;
  }
  const jabberRate = jabberWins / 200;
  assert.ok(jabberRate > 0.3 && jabberRate < 0.7, `charger vs jabber should be competitive, jabber win rate ${jabberRate}`);
});

test('replay files re-simulate exactly; tampering is caught', () => {
  const dir = mkdtempSync(join(tmpdir(), 'duel-'));
  const file = join(dir, 'r.json');
  const seed = 42;
  const movesA = genMoves(11), movesB = genMoves(12);
  const replay = saveReplay(file, { seed, players: [{ name: 'x' }, { name: 'y' }], movesA, movesB });
  assert.ok(verifyReplay(replay));
  replay.log[0].hp[0] = 1; // tamper
  assert.equal(verifyReplay(replay), false);
  rmSync(dir, { recursive: true, force: true });
});
