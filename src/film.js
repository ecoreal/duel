// duel film: a replay → an animated GIF. Every turn is a frame, rendered by the
// same renderFrame() the TUI uses, so the GIF can never drift from the arena.
import { renderFrame, vis } from './render.js';
import { createCanvas, ansiLinesToCanvas, rect, text, C, PALETTE, TRANSPARENT } from './pixels.js';
import { encodeGif } from './gif.js';
import { ADVANCE, LINE_H } from './font.js';
import { writeFileSync } from 'node:fs';

/**
 * Build the frames for one replay.
 *  cols/rows: the character grid handed to renderFrame (80x24 by default)
 *  frames:    animation length; long matches are sampled evenly, always
 *             including turn 0 and the final turn
 */
/**
 * Full frames → delta frames: identical pixels become TRANSPARENT and the
 * viewer keeps what it already had (disposal 1). Frame 0 stays complete. In a
 * replay most of the arena — names, health bars, the border — never moves, so
 * this is where the bytes are.
 */
export function deltaFrames(frames, transparentIndex = TRANSPARENT) {
  let prev = null;
  return frames.map(f => {
    if (!prev) { prev = f.pixels.slice(); return { ...f, changed: f.pixels.length }; }
    const out = new Uint8Array(f.pixels.length);
    let changed = 0;
    for (let i = 0; i < f.pixels.length; i++) {
      if (f.pixels[i] === prev[i]) out[i] = transparentIndex;
      else { out[i] = f.pixels[i]; changed++; }
    }
    prev = f.pixels.slice();
    return { ...f, pixels: out, changed };
  });
}

export function buildReplayFilm({ replay, cols = 80, rows = 24, frames: maxFrames = 40, delayCs = 18, scale = 1, diff = true } = {}) {
  const total = replay.result.turns;
  const pad = 6;
  const width = cols * ADVANCE * scale + pad * 2;
  const height = rows * LINE_H * scale + pad * 2;

  const stops = [];
  const wanted = Math.min(maxFrames, total + 1);
  const stride = Math.max(1, Math.ceil((total + 1) / wanted));
  for (let t = 0; t <= total; t += stride) stops.push(t);
  if (stops[stops.length - 1] !== total) stops.push(total);

  const palette = PALETTE;
  const verdict = replay.result.winner === 'draw'
    ? 'DRAW'
    : `${(replay.result.winner === 'a' ? replay.players[0] : replay.players[1]).name} WINS`;
  const out = [];
  for (const turn of stops) {
    const cv = createCanvas(width, height, C.bg);
    // a hairline frame so the film reads as a screen, not a floating blob
    rect(cv, pad - 3, pad - 3, width - (pad - 3) * 2, 1, C.faint);
    rect(cv, pad - 3, height - pad + 2, width - (pad - 3) * 2, 1, C.faint);
    const lines = renderFrame({ replay, turn, w: cols, h: rows - 1, hint: false });
    const bottom = ansiLinesToCanvas(cv, lines, pad, pad, { scale }) - LINE_H * scale;
    // footer: where we are, and how it ends — the GIF has no keyboard to explain
    const at = Math.min(turn, total);
    const left = `REPLAY ${replay.game || 'clash/1'} * SEED ${replay.seed}`;
    const right = turn >= total ? `TURN ${at}/${total} * ${verdict}` : `TURN ${at}/${total}`;
    text(cv, pad, bottom + LINE_H * scale, left, C.dim, scale);
    text(cv, width - pad - right.length * ADVANCE * scale, bottom + LINE_H * scale, right, turn >= total ? C.hue(2, 1) : C.hue(6, 1), scale);
    out.push({ pixels: cv.px, delayCs });
  }
  return {
    width,
    height,
    palette,
    frames: diff ? deltaFrames(out) : out,
    stops,
    transparent: diff ? TRANSPARENT : null,
  };
}

/** Write the film as an animated GIF. */
export function writeFilm(out, film) {
  const buf = encodeGif(film);
  writeFileSync(out, buf);
  return { path: out, bytes: buf.length, frames: film.frames.length, width: film.width, height: film.height };
}

/** Storyboard: the plain-text frames `duel film` prints, for pasting into issues. */
export function filmStops(replay, every = 3) {
  const total = replay.result.turns;
  const stops = [];
  for (let t = every; t <= total; t += every) stops.push(t);
  if (stops[stops.length - 1] !== total) stops.push(total);
  return stops;
}

export { vis };