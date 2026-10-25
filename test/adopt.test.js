import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSource, adopt } from '../src/adopt.js';
import { askAgent, agentName } from '../src/agent.js';
import { saveReplay } from '../src/replay.js';
import { agentView } from '../src/engine.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('resolveSource maps gists, urls and files', () => {
  assert.deepEqual(resolveSource('https://gist.github.com/al/abc123'), { kind: 'gist-api', href: 'https://api.github.com/gists/abc123' });
  assert.deepEqual(resolveSource('https://gist.github.com/al/abc123#file-x'), { kind: 'gist-api', href: 'https://api.github.com/gists/abc123' });
  assert.deepEqual(resolveSource('https://example.com/r.json'), { kind: 'http', href: 'https://example.com/r.json' });
  assert.deepEqual(resolveSource('./local.json'), { kind: 'file', href: './local.json' });
});

test('ghost agents replay recorded moves, then jab', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'duel-ghost-'));
  const file = join(dir, 'g.json');
  saveReplay(file, { seed: 5, players: [{ name: 'a' }, { name: 'b' }], movesA: ['charge', 'heavy'], movesB: ['strike', 'strike'] });
  assert.equal(agentName(`ghost:${file}:0`), 'g-ghost0');
  const v1 = agentView([], 0, 1);
  const r1 = await askAgent(`ghost:${file}:0`, v1);
  assert.equal(r1.move, 'charge');
  assert.equal((await askAgent(`ghost:${file}:0`, agentView([], 0, 2))).move, 'heavy');
  const r3 = await askAgent(`ghost:${file}:0`, agentView([], 0, 3));
  assert.equal(r3.move, 'strike'); // out of tape → jab
  assert.equal(r3.ok, false);
  rmSync(dir, { recursive: true, force: true });
});

test('adopt accepts a valid local replay and rejects tampered ones', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'duel-adopt-'));
  const src = join(dir, 'src.json');
  saveReplay(src, { seed: 9, players: [{ name: 'x' }, { name: 'y' }], movesA: ['strike'], movesB: ['heal'] });
  const out = join(dir, 'adopted.json');
  const replay = await adopt(src, out);
  assert.equal(replay.seed, 9);

  // tamper: stored log no longer matches seed+moves
  const bad = join(dir, 'bad.json');
  const parsed = JSON.parse((await import('node:fs')).readFileSync(src, 'utf8'));
  parsed.log[0].hp[0] = 7;
  writeFileSync(bad, JSON.stringify(parsed));
  await assert.rejects(() => adopt(bad, join(dir, 'x.json')), /integrity/);
  rmSync(dir, { recursive: true, force: true });
});
