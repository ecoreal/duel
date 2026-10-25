import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expected, update } from '../src/elo.js';

test('expected score math', () => {
  assert.equal(expected(1200, 1200), 0.5);
  assert.ok(expected(1400, 1000) > 0.9);
  assert.ok(expected(1000, 1400) < 0.1);
});

test('rating update is zero-sum and moves the right way', () => {
  const [ra, rb] = update(1200, 1200, 1);
  assert.ok(ra > 1200 && rb < 1200);
  assert.equal(ra + rb, 2400); // points are conserved
  const [rc, rd] = update(1200, 1200, 0);
  assert.equal(rc, rb); // a loss mirrors a win
  assert.equal(rd, ra);
});
