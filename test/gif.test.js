import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadReplay } from '../src/replay.js';
import { play } from '../src/engine.js';
import { buildReplayFilm, filmStops, writeFilm, deltaFrames } from '../src/film.js';
import { encodeGif } from '../src/gif.js';
import { PALETTE, C, TRANSPARENT } from '../src/pixels.js';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const clash = () => loadReplay('examples/clash-greedy-vs-random.json');
const rope = () => loadReplay('examples/rope-greedy-vs-random.json');

const hasColor = (frame, idx) => frame.pixels.includes(idx);

test('buildReplayFilm: deterministic, palette-safe, starts at turn 0 and ends at the finish', () => {
  const replay = clash();
  const a = buildReplayFilm({ replay, frames: 12 });
  const b = buildReplayFilm({ replay, frames: 12 });
  assert.equal(a.stops[0], 0, 'frame 0 is the opening bell');
  assert.equal(a.stops[a.stops.length - 1], replay.result.turns, 'last frame is the final turn');
  for (const f of a.frames) {
    assert.equal(f.pixels.length, a.width * a.height);
    assert.ok(Math.max(...f.pixels) <= TRANSPARENT, 'palette slot or the transparent marker');
  }
  assert.deepEqual(a.frames.map(f => [...f.pixels]), b.frames.map(f => [...f.pixels]));
});

test('frames are sampled when a match is longer than the budget', () => {
  const replay = clash(); // 12 turns → 13 positions
  const film = buildReplayFilm({ replay, frames: 4 });
  assert.ok(film.stops.length <= 5, `expected ≤5 stops, got ${film.stops.length}`);
  const ascending = film.stops.every((t, i) => i === 0 || t > film.stops[i - 1]);
  assert.ok(ascending, 'stops are strictly increasing');
});

test('the final frame carries the verdict in the winner colour', () => {
  const replay = rope();
  const film = buildReplayFilm({ replay, frames: 10 });
  const last = film.frames[film.frames.length - 1];
  assert.ok(hasColor(last, C.hue(2, 1)), 'bright green WINS footer');
  const first = film.frames[0];
  assert.ok(hasColor(first, C.hue(6, 1)), 'cyan turn counter while the match is live');
});

test('rope and clash both film (no hp/knot assumptions leak in)', () => {
  for (const replay of [clash(), rope()]) {
    const film = buildReplayFilm({ replay, frames: 3, cols: 60, rows: 16 });
    assert.ok(film.frames.length >= 2);
    const ink = film.frames[film.frames.length - 1].pixels.some(p => p !== C.bg);
    assert.ok(ink, `${replay.game} film has content`);
  }
});

test('columns and rows control the canvas size', () => {
  const film = buildReplayFilm({ replay: clash(), cols: 40, rows: 12, frames: 2 });
  // 40 cols × 6px advance + padding; 12 rows × 9px line height + padding
  assert.equal(film.width, 40 * 6 + 12);
  assert.equal(film.height, 12 * 9 + 12);
});

test('filmStops always includes the final turn', () => {
  assert.deepEqual(filmStops({ result: { turns: 10 } }, 3), [3, 6, 9, 10]);
  assert.deepEqual(filmStops({ result: { turns: 3 } }, 3), [3]);
});

test('writeFilm writes a valid GIF envelope and reports its size', () => {
  const dir = mkdtempSync(join(tmpdir(), 'duel-gif-'));
  try {
    const out = join(dir, 'm.gif');
    const r = writeFilm(out, buildReplayFilm({ replay: clash(), frames: 3 }));
    const buf = readFileSync(out);
    assert.equal(buf.subarray(0, 6).toString('ascii'), 'GIF89a');
    assert.equal(buf[buf.length - 1], 0x3b);
    assert.equal(r.bytes, buf.length);
    assert.ok(r.frames >= 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a film of an empty (zero-turn) match still encodes', () => {
  const replay = { game: 'clash/2', seed: 1, players: [{ name: 'a' }, { name: 'b' }], log: [], moves: [], result: { winner: 'draw', hp: [100, 100], turns: 0, stop: 'moves' } };
  const film = buildReplayFilm({ replay, frames: 4 });
  assert.equal(film.frames.length, 1);
  assert.ok(encodeGif(film).length > 0);
});
test('deltaFrames: frame 0 complete, later frames only the changes', () => {
  const a = new Uint8Array([1, 2, 3, 4]);
  const b = new Uint8Array([1, 9, 3, 9]);
  const out = deltaFrames([{ pixels: a }, { pixels: b }]);
  assert.deepEqual([...out[0].pixels], [1, 2, 3, 4]);
  assert.deepEqual([...out[1].pixels], [TRANSPARENT, 9, TRANSPARENT, 9]);
  assert.equal(out[1].changed, 2);
});

test('buildReplayFilm defaults to deltas and the composite is unchanged', () => {
  const replay = rope();
  const opts = { replay, frames: 12 };
  const delta = buildReplayFilm(opts);
  const full = buildReplayFilm({ ...opts, diff: false });
  assert.equal(delta.transparent, TRANSPARENT);
  assert.equal(full.transparent, null);
  assert.ok(delta.frames[0].pixels.every(v => v !== TRANSPARENT), 'the opening bell is complete');
  const render = film => {
    const screen = new Uint8Array(film.width * film.height);
    return film.frames.map(f => {
      for (let i = 0; i < screen.length; i++) {
        if (film.transparent == null || f.pixels[i] !== film.transparent) screen[i] = f.pixels[i];
      }
      return [...screen];
    });
  };
  assert.deepEqual(render(delta), render(full));
});

test('deltas make the file smaller for both games', () => {
  for (const replay of [clash(), rope()]) {
    const opts = { replay, frames: 14 };
    const d = encodeGif(buildReplayFilm(opts));
    const f = encodeGif(buildReplayFilm({ ...opts, diff: false }));
    assert.ok(d.length < f.length, `${replay.game}: delta ${d.length} vs full ${f.length}`);
  }
});
