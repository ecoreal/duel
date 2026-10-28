import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streamMatch, streamReplay, turnLine } from '../src/stream.js';
import { play } from '../src/engine.js';
import { loadReplay, verifyReplay } from '../src/replay.js';
import { vis } from '../src/render.js';

const noSleep = () => Promise.resolve();

function collector() {
  const chunks = [];
  return { chunks, write: s => chunks.push(s), text: () => chunks.join('') };
}

test('streamMatch plays a whole match, one line per turn, and returns a verifiable replay', async () => {
  const io = collector();
  const players = [{ name: 'ghost-a' }, { name: 'ghost-b' }];
  const { replay, fails } = await streamMatch({
    cmdA: 'builtin:greedy', cmdB: 'builtin:random',
    seed: 21, game: 'clash/2', players,
    delay: 0, write: io.write, isTTY: false, sleepFn: noSleep,
  });

  const lines = io.text().trim().split('\n');
  assert.equal(lines.length, replay.result.turns + 1, 'one line per turn + verdict');
  assert.match(lines[0], /^T01 /);
  assert.match(lines[lines.length - 1], /wins|draw/);
  assert.match(lines[0], /hp \d+:\d+/);
  assert.deepEqual(fails, { a: 0, b: 0 });

  // the streamed replay is the same object the engine produces — nothing invented
  assert.ok(verifyReplay(replay), 'streaming must not corrupt the replay');
  const { result } = play(21, replay.moves.map(m => m[0]), replay.moves.map(m => m[1]), 'clash/2');
  assert.deepEqual(result, replay.result);
});

test('streamMatch on a pipe emits stable greppable turns and optional frames', async () => {
  const io = collector();
  await streamMatch({
    cmdA: 'builtin:rope-greedy', cmdB: 'builtin:random',
    seed: 5, game: 'rope/1', players: [{ name: 'a' }, { name: 'b' }],
    delay: 0, every: 4, write: io.write, isTTY: false, sleepFn: noSleep,
  });
  const text = vis(io.text());
  assert.match(text, /knot [-+]?\d/);
  assert.match(text, /A ▏/, 'rope frames are interleaved every N turns');
  assert.ok(text.split('\n').length > 4);
  // a frame mid-match must not invent a winner: no WINS before the last line
  const lines = text.trim().split('\n');
  assert.ok(!lines.slice(0, -1).some(l => /WINS/.test(l)), 'no premature verdict');
});

test('streamMatch in a TTY redraws in place instead of appending', async () => {
  const io = collector();
  await streamMatch({
    cmdA: 'builtin:greedy', cmdB: 'builtin:greedy',
    seed: 3, players: [{ name: 'a' }, { name: 'b' }], delay: 0,
    cols: 40, rows: 10, write: io.write, isTTY: true, sleepFn: noSleep,
  });
  const text = io.text();
  assert.ok(text.includes('\x1b[?25l'), 'cursor hidden while streaming');
  assert.ok(text.includes('\x1b[10A'), 'cursor moved back up to redraw');
  assert.ok(text.includes('\x1b[?25h'), 'cursor restored at the end');
  assert.match(text, /wins|draw/);
});

test('onTurn sees each turn exactly once, in order', async () => {
  const seen = [];
  const { replay } = await streamMatch({
    cmdA: 'builtin:greedy', cmdB: 'builtin:random', seed: 8,
    players: [{ name: 'a' }, { name: 'b' }], delay: 0,
    write: () => {}, isTTY: false, sleepFn: noSleep,
    onTurn: r => seen.push(r.log.length),
  });
  assert.deepEqual(seen, Array.from({ length: replay.result.turns }, (_, i) => i + 1));
});

test('turnLine narrates clash damage, heals and recoil without ANSI', () => {
  const replay = { players: [{ name: 'A' }, { name: 'B' }] };
  const line = turnLine(replay, { turn: 3, moves: ['heavy', 'heal'], dmg: [22, 0], heal: [0, 11], recoil: [5, 0], hp: [70, 80] });
  assert.equal(vis(line), 'T03 A heavy 22 (recoil 5) · B heals 11 · hp 70:80');
  const quiet = turnLine(replay, { turn: 4, moves: ['charge', 'charge'], dmg: [0, 0], heal: [0, 0], recoil: [0, 0], hp: [70, 80] });
  assert.match(quiet, /A charge · B charge/);
  const rope = turnLine(replay, { turn: 2, moves: ['lunge', 'lean'], knot: -1, stamina: [6, 10], slipped: [true, false] });
  assert.equal(vis(rope), 'T02 A lunge (slip!) vs B lean · knot -1 [6:10]');
});

test('streamReplay reruns a recording frame by frame (pipe mode is plain text)', async () => {
  const io = collector();
  const replay = loadReplay('examples/rope-greedy-vs-random.json');
  await streamReplay({ replay, delay: 0, write: io.write, isTTY: false, cols: 60, rows: 14, sleepFn: noSleep });
  const text = vis(io.text());
  assert.match(text, /turn 0\//, 'opens with the starting position');
  assert.match(text, new RegExp(`turn ${replay.result.turns}/${replay.result.turns}`), 'ends on the final turn');
  assert.ok(!text.includes('\x1b['), 'no ANSI escapes on a pipe');
});