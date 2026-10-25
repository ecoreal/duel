import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  play, agentView, makeRng, validMove, defaultMove, maxTurnsFor,
  ROPE_MOVES, ROPE_MAX_TURNS, ROPE_KNOT_LIMIT, ROPE_STAMINA_MAX,
} from '../src/engine.js';
import { saveReplay, verifyReplay } from '../src/replay.js';
import { runMatch } from '../src/cli.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const hauls = n => Array(n).fill('haul');

test('rope/1: same seed + same moves => byte-identical log', () => {
  const a = play(42, hauls(30), Array(30).fill('rest'), 'rope/1');
  const b = play(42, hauls(30), Array(30).fill('rest'), 'rope/1');
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.result.stop, 'winner'); // unopposed hauler reaches the edge
  assert.equal(a.result.winner, 'a');
  assert.equal(a.result.knot, ROPE_KNOT_LIMIT);
});

test('rope/1: win boundaries — +6 ends for A, -6 for B, timeout leans, 0 draws', () => {
  // A hauls unopposed → knot reaches +6 → a
  const a = play(1, hauls(30), Array(30).fill('rest'), 'rope/1');
  assert.equal(a.result.winner, 'a');
  assert.equal(a.result.stop, 'winner');
  // mirrored → b
  const b = play(1, Array(30).fill('rest'), hauls(30), 'rope/1');
  assert.equal(b.result.winner, 'b');
  // both rest forever → knot 0 at the turn limit → draw by lean rule
  const d = play(1, Array(ROPE_MAX_TURNS).fill('rest'), Array(ROPE_MAX_TURNS).fill('rest'), 'rope/1');
  assert.equal(d.result.winner, 'draw');
  assert.equal(d.result.turns, ROPE_MAX_TURNS);
  assert.equal(d.result.stop, 'maxturns');
  // a one-turn pull followed by all-rest ends at the turn limit: the timeout
  // winner must match the knot's sign on every deterministic seed
  for (let seed = 1; seed <= 50; seed++) {
    const r = play(seed, [...hauls(1), ...Array(ROPE_MAX_TURNS - 1).fill('rest')],
      Array(ROPE_MAX_TURNS).fill('rest'), 'rope/1');
    if (r.result.stop === 'maxturns') {
      const knot = r.result.knot;
      assert.equal(r.result.winner, knot > 0 ? 'a' : knot < 0 ? 'b' : 'draw');
    }
  }
});

test('rope/1: stamina caps at 10, floors at 0, unaffordable moves coerce to rest', () => {
  // resting at full stays at 10
  const idle = play(1, Array(3).fill('rest'), Array(3).fill('rest'), 'rope/1');
  for (const t of idle.log) assert.equal(t.stamina[0], ROPE_STAMINA_MAX);
  // hauler burns out: after 5 hauls… wait, haul costs 3 → 3 hauls then coerce.
  const burn = play(1, hauls(12), Array(12).fill('rest'), 'rope/1');
  const moves = burn.log.map(t => t.moves[0]);
  const stams = burn.log.map(t => t.stamina[0]);
  assert.ok(moves.includes('rest'), 'engine coerced an unaffordable haul to rest');
  for (const s of stams) assert.ok(s >= 0 && s <= ROPE_STAMINA_MAX, `stamina in range: ${s}`);
  // explicit: the engine never lets a starved side pull — coercion keeps it legal
  const drained = play(1, hauls(12), Array(12).fill('rest'), 'rope/1');
  let pre = ROPE_STAMINA_MAX;
  for (const t of drained.log) {
    if (t.moves[0] === 'haul') assert.ok(pre >= ROPE_MOVES.haul.cost, 'haul only when affordable');
    if (t.moves[0] === 'lunge') assert.ok(pre >= ROPE_MOVES.lunge.cost, 'lunge only when affordable');
    if (pre < ROPE_MOVES.haul.cost) assert.equal(t.moves[0], 'rest', 'a starved side can only rest');
    assert.ok(t.stamina[0] >= 0 && t.stamina[0] <= ROPE_STAMINA_MAX, `stamina in range: ${t.stamina[0]}`);
    pre = t.stamina[0];
  }
});

test('rope/1: lean halves the foe\'s pull — the knot sits on a 0.5 grid', () => {
  // A hauls, B leans: 1 → 0.5
  const r = play(1, ['haul'], ['lean'], 'rope/1');
  const slips = r.log[0].slipped;
  assert.equal(r.log[0].knot, slips[0] ? -0.5 : 0.5);
  // a slipped haul into a lean also arrives halved (0.5 the other way)
  // both rest → knot never moves
  const still = play(1, ['rest'], ['rest'], 'rope/1');
  assert.equal(still.log[0].knot, 0);
  assert.equal(still.log[0].delta, 0);
});

test('rope/1: slips are seeded, not random — both outcomes exist across seeds', () => {
  let slipped = 0, clean = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const r = play(seed, ['haul'], ['rest'], 'rope/1');
    if (r.log[0].slipped[0]) { slipped++; assert.equal(r.log[0].knot, -1); }
    else { clean++; assert.equal(r.log[0].knot, 1); }
  }
  assert.ok(slipped > 5 && clean > 50, `slip rate plausible: ${slipped}/100`);
  // and the same seed always slips the same way
  assert.equal(play(7, ['haul'], ['rest'], 'rope/1').log[0].slipped[0],
    play(7, ['haul'], ['rest'], 'rope/1').log[0].slipped[0]);
});

test('rope/1: lunges pull 2 and need 4 stamina', () => {
  const r = play(1, ['lunge'], ['rest'], 'rope/1');
  assert.equal(r.log[0].knot, r.log[0].slipped[0] ? -2 : 2);
  assert.equal(r.log[0].stamina[0], ROPE_STAMINA_MAX - ROPE_MOVES.lunge.cost);
  // lunge at 1 stamina coerces to rest (drain 10 → 7 → 4 → 1 by hauling)
  const low = play(1, ['haul', 'haul', 'haul', 'lunge'], Array(4).fill('rest'), 'rope/1');
  assert.equal(low.log[3].moves[0], 'rest');
  assert.equal(low.log[3].knot, low.log[2].knot, 'coerced rest pulls nothing');
});

test('rope/1: per-game plumbing — validMove, defaultMove, maxTurnsFor, agentView', () => {
  assert.equal(validMove('haul', 'rope/1'), 'haul');
  assert.equal(validMove('strike', 'rope/1'), 'haul', 'clash moves coerce into rope moves');
  assert.equal(validMove('strike', 'clash/2'), 'strike');
  assert.equal(validMove('haul'), 'strike', 'default game stays clash');
  assert.equal(defaultMove('rope/1'), 'haul');
  assert.equal(defaultMove('clash/2'), 'strike');
  assert.equal(maxTurnsFor('rope/1'), ROPE_MAX_TURNS);
  assert.equal(maxTurnsFor('clash/2'), 40);

  const sim = play(1, ['haul'], ['rest'], 'rope/1');
  const v0 = agentView(sim.log, 0, 2, 'rope/1');
  assert.equal(v0.game, 'rope/1');
  assert.equal(v0.maxTurns, ROPE_MAX_TURNS);
  assert.equal(v0.knot, sim.log[0].knot);
  assert.equal(v0.stamina, sim.log[0].stamina[0]);
  assert.equal(v0.foeStamina, sim.log[0].stamina[1]);
  assert.deepEqual(v0.moves, Object.keys(ROPE_MOVES));
  assert.deepEqual(v0.me, { stamina: sim.log[0].stamina[0], dir: 1 });
  assert.deepEqual(v0.foe, { stamina: sim.log[0].stamina[1], dir: -1 });
  assert.match(v0.rules.haul, /3 stamina/);
  assert.match(v0.rules.win, /30 turns/);
  // fresh view (no log yet) shows the start state
  const fresh = agentView([], 1, 1, 'rope/1');
  assert.equal(fresh.knot, 0);
  assert.equal(fresh.stamina, ROPE_STAMINA_MAX);
  assert.equal(fresh.me.dir, -1, 'side B sees its own direction');
});

test('rope/1: replays verify and tampering is caught', () => {
  const dir = mkdtempSync(join(tmpdir(), 'duel-rope-'));
  const file = join(dir, 'rope.json');
  const movesA = ['haul', 'haul', 'lean', 'lunge'], movesB = ['lean', 'rest', 'haul', 'rest'];
  const replay = saveReplay(file, { seed: 9, players: [{ name: 'x' }, { name: 'y' }], movesA, movesB, game: 'rope/1' });
  assert.equal(replay.game, 'rope/1');
  assert.equal(replay.result.winner, 'a'); // unopposed early pulls decide
  assert.ok(verifyReplay(replay));
  replay.log[0].knot = 3; // tamper
  assert.equal(verifyReplay(replay), false);
  rmSync(dir, { recursive: true, force: true });
});

test('rope/1: builtin rope bots fight a legal end-to-end match via runMatch', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'duel-rope-e2e-'));
  const { movesA, movesB, game } = await runMatch('builtin:rope-greedy', 'builtin:random', { seed: 11, timeout: 500, game: 'rope/1' });
  assert.equal(game, 'rope/1');
  assert.ok(movesA.length > 0 && movesA.length <= ROPE_MAX_TURNS);
  for (const m of [...movesA, ...movesB]) assert.ok(ROPE_MOVES[m], `legal rope move: ${m}`);
  const r = play(11, movesA, movesB, 'rope/1');
  assert.ok(['a', 'b', 'draw'].includes(r.result.winner));
  assert.equal(r.result.turns, movesA.length);
  // the replay of that exact match verifies
  const replay = saveReplay(join(dir, 'e2e.json'), {
    seed: 11, players: [{ name: 'rope-greedy' }, { name: 'random' }], movesA, movesB, game: 'rope/1',
  });
  assert.ok(verifyReplay(replay));
  rmSync(dir, { recursive: true, force: true });
});

test('rope/1: dispatch is clean — clash math untouched, unknown games fall back', () => {
  const A = ['strike', 'heal'], B = ['charge', 'strike'];
  assert.deepEqual(play(5, A, B, 'clash/2'), play(5, A, B, 'clash/2'));
  assert.deepEqual(play(5, A, B, 'mystery/9'), play(5, A, B, 'clash/2'), 'unknown game → clash/2');
  assert.notDeepEqual(play(5, A, B, 'rope/1').log, play(5, A, B, 'clash/2').log);
  // makeRng still the only randomness source: two ropes with same seed agree
  const rng = makeRng(3);
  assert.equal(typeof rng(), 'number');
});
