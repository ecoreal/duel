import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDraft, draftLine } from '../src/draft.js';
import { askAgent } from '../src/agent.js';
import { play, agentView, banView, legalMoves, clampBans, movesOf, moveKind, banAllowed, legalBans } from '../src/engine.js';
import { saveReplay, verifyReplay } from '../src/replay.js';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const draft = (seed, game = 'clash/2', a = 'builtin:greedy', b = 'builtin:random') =>
  runDraft({ cmdA: a, cmdB: b, seed, game });

test('a draft removes one move per side, never the last move', async () => {
  for (const game of ['clash/2', 'rope/1']) {
    for (const seed of [1, 2, 3, 10]) {
      const { bans } = await draft(seed, game);
      const all = Object.keys(movesOf(game));
      assert.equal(bans.length, 2, `${game} seed ${seed}: two bans`);
      assert.equal(new Set(bans).size, 2, 'nobody bans the same move twice');
      assert.ok(legalMoves(game, bans).length >= all.length - 2);
      assert.ok(legalMoves(game, bans).length >= 1, 'a game must remain playable');
    }
  }
});

test('the seed decides who bans first, so a series alternates', async () => {
  const even = await draft(4);
  const odd = await draft(5);
  assert.equal(even.first, 0);
  assert.equal(odd.first, 1);
  assert.equal(even.picks[0].side, 0);
  assert.equal(odd.picks[0].side, 1);
});

test('bans actually change the game: a banned move is not played', async () => {
  // `greedy` loves heavy; ban it and the same seed plays differently
  const seed = 7;
  const plain = await (await import('../src/cli.js')).runMatch('builtin:greedy', 'builtin:random', { seed, timeout: 5000, game: 'clash/2' });
  const forced = await (await import('../src/cli.js')).runMatch('builtin:greedy', 'builtin:random', { seed, timeout: 5000, game: 'clash/2', bans: ['heavy'] });
  assert.ok(plain.movesA.includes('heavy') || plain.movesB.includes('heavy'), 'the control game does use heavy');
  assert.ok(!forced.movesA.includes('heavy'), 'A never plays a banned move');
  assert.ok(!forced.movesB.includes('heavy'), 'B never plays a banned move');
});

test('agentView exposes the ban list and only legal moves', () => {
  const view = agentView([], 0, 1, 'clash/2', ['heal', 'heavy']);
  assert.deepEqual(view.banned, ['heal', 'heavy']);
  assert.deepEqual(view.moves, ['strike', 'charge']);
  const rope = agentView([], 1, 1, 'rope/1', ['haul']);
  assert.deepEqual(rope.moves, ['lunge', 'lean', 'rest']);
  assert.deepEqual(rope.banned, ['haul']);
});

test('banView is a phase, not a move turn', () => {
  const v = banView({ you: 0, gameId: 'clash/2', bans: ['heal'] });
  assert.equal(v.phase, 'ban');
  assert.deepEqual(v.banned, ['heal']);
  assert.ok(!v.moves.includes('heal'));
});

test('a draft can never remove every attack — that game could not end', () => {
  const all = Object.keys(movesOf('clash/2'));
  // greedy's two favourite bans must not both land
  assert.equal(banAllowed('clash/2', ['heavy'], 'strike'), false, 'no attack would survive');
  assert.equal(banAllowed('clash/2', ['strike'], 'heavy'), false);
  assert.equal(banAllowed('clash/2', [], 'strike'), true);
  for (const game of ['clash/2', 'rope/1']) {
    const left = legalMoves(game, Object.keys(movesOf(game)));
    assert.ok(left.some(m => moveKind(game, m) === 'attack'), `${game} keeps an attack`);
    // and the engine still plays the game to a conclusion
    const moves = Array(40).fill(left.find(m => moveKind(game, m) === 'attack'));
    const r = play(1, moves, moves, game, Object.keys(movesOf(game)));
    assert.ok(r.result.turns > 0);
  }
  assert.deepEqual(legalBans('clash/2', ['heavy']), ['heal', 'charge'], 'strike is off the table once heavy is gone');
});

test('a drafted match always ends — no heal-only stalemate', async () => {
  const { runMatch } = await import('../src/cli.js');
  for (const seed of [100, 101, 102, 103]) {
    const { bans } = await draft(seed, 'clash/2', 'bots/greedy.mjs', 'bots/adapt.mjs');
    const m = await runMatch('bots/greedy.mjs', 'bots/adapt.mjs', { seed, timeout: 5000, game: 'clash/2', bans });
    const r = play(seed, m.movesA, m.movesB, 'clash/2', bans).result;
    assert.notEqual(r.stop, 'maxturns', `seed ${seed} (bans ${bans}) hit the turn limit`);
  }
});

test('a draft replay records its bans and verifies only with them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'duel-draft-'));
  try {
    const out = join(dir, 'm.json');
    const seed = 11, bans = ['heavy', 'heal'];
    const movesA = Array(40).fill('heavy');
    const movesB = Array(40).fill('heal');
    const replay = saveReplay(out, { seed, players: [{ name: 'a' }, { name: 'b' }], movesA, movesB, game: 'clash/2', bans });
    assert.deepEqual(replay.bans, bans);
    assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')).bans, bans);
    assert.ok(verifyReplay(replay), 'verifies with its own bans');
    assert.ok(!verifyReplay({ ...replay, bans: [] }), 'dropping the bans invalidates the log');
    assert.ok(!verifyReplay({ ...replay, bans: ['heal'] }), 'editing the bans invalidates the log');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a replay without bans stays byte-identical to the old format', () => {
  const dir = mkdtempSync(join(tmpdir(), 'duel-noban-'));
  try {
    const out = join(dir, 'm.json');
    saveReplay(out, { seed: 3, players: [{ name: 'a' }, { name: 'b' }], movesA: ['strike'], movesB: ['strike'], game: 'clash/2' });
    assert.ok(!('bans' in JSON.parse(readFileSync(out, 'utf8'))), 'no empty bans key');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a malformed ban reply cannot break the draft', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'duel-badban-'));
  try {
    const bot = join(dir, 'liar.sh');
    writeFileSync(bot, '#!/bin/sh\ncat >/dev/null\necho \'{"ban":"nonsense"}\'\n');
    const { bans, picks } = await runDraft({ cmdA: `sh ${bot}`, cmdB: 'builtin:greedy', seed: 2, game: 'clash/2', timeout: 4000 });
    assert.equal(bans.length, 2);
    for (const b of bans) assert.ok(Object.keys(movesOf('clash/2')).includes(b));
    assert.ok(picks.every(p => typeof p.ban === 'string'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a silent agent loses the draft gracefully (legal fallback, still flagged)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'duel-mute-'));
  try {
    const bot = join(dir, 'mute.sh');
    writeFileSync(bot, '#!/bin/sh\ncat >/dev/null\nexit 0\n');
    const { bans, fails } = await runDraft({ cmdA: `sh ${bot}`, cmdB: 'builtin:greedy', seed: 1, game: 'clash/2', timeout: 3000 });
    assert.equal(bans.length, 2);
    assert.ok(fails.a + fails.b >= 1, 'the mute side is counted');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('draftLine names both sides', async () => {
  const { picks, first } = await draft(7);
  const line = draftLine(picks, ['greedy', 'random'], first);
  assert.match(line, /draft:/);
  assert.match(line, /bans/);
  assert.match(line, /first/);
});

test('builtin bans are deterministic — a yardstick cannot wobble', async () => {
  for (const game of ['clash/2', 'rope/1']) {
    const one = await draft(9, game);
    const two = await draft(9, game);
    assert.deepEqual(one.bans, two.bans);
  }
});

test('ghosts play along: a recording has no draft opinion', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'duel-ghostban-'));
  try {
    const out = join(dir, 'g.json');
    saveReplay(out, { seed: 1, players: [{ name: 'x' }, { name: 'y' }], movesA: Array(40).fill('strike'), movesB: Array(40).fill('strike'), game: 'clash/2' });
    const r = await askAgent(`ghost:${out}:0`, banView({ you: 0, gameId: 'clash/2' }), 3000);
    assert.equal(r.ok, true);
    assert.ok(Object.keys(movesOf('clash/2')).includes(r.ban));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
