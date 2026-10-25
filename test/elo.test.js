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

test('season seeds derive from the ISO week (deterministic)', async () => {
  const { seasonSeed } = await import('../src/season.mjs');
  const sun = seasonSeed(new Date('2026-10-25T00:00:00Z')); // W43 (ISO weeks end Sunday)
  const mon = seasonSeed(new Date('2026-10-26T00:00:00Z')); // W44 starts Monday
  assert.equal(mon - sun, 1);
  assert.equal(seasonSeed(new Date('2026-10-21T00:00:00Z')), sun); // same W43
});

test('film frames: stops cover every N turns plus the final', async () => {
  const { saveReplay } = await import('../src/replay.js');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'duel-film-'));
  const file = join(dir, 'r.json');
  saveReplay(file, { seed: 42, players: [{ name: 'a' }, { name: 'b' }], movesA: Array(40).fill('strike'), movesB: Array(40).fill('strike') });
  const { loadReplay } = await import('../src/replay.js');
  const replay = loadReplay(file);
  const every = 6, total = replay.result.turns;
  const stops = [];
  for (let t = every; t <= total; t += every) stops.push(t);
  if (stops[stops.length - 1] !== total) stops.push(total);
  assert.ok(stops.length >= 1);
  assert.equal(stops[stops.length - 1], total);
  assert.deepEqual(stops, [...new Set(stops)]);
  rmSync(dir, { recursive: true, force: true });
});
