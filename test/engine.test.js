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
      assert.ok(t.dmg.every(d => d === 0 || (d >= 10 && d <= Math.floor(26 * 1.8))));
    }
    assert.ok(['a', 'b', 'draw'].includes(result.winner));
    assert.ok(result.turns <= MAX_TURNS);
  }
});

test('charge multiplies and is consumed; heal caps at 100', () => {
  // A charges then strikes; B heals both turns
  const { log } = play(3, ['charge', 'strike'], ['heal', 'heal']);
  assert.equal(log[0].moves[0], 'charge');
  assert.ok(log[0].charged[0], 'charge flag set after charging');
  assert.ok(log[1].dmg[0] >= Math.floor(10 * 1.8), `charged strike dmg boosted: ${log[1].dmg[0]}`);
  assert.equal(log[1].charged[0], false, 'charge consumed by attack');

  const spam = play(5, Array(30).fill('heal'), Array(30).fill('strike'));
  for (const t of spam.log) assert.ok(t.hp[0] <= 100);
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
