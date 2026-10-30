// A terminal frame is coloured characters; a GIF frame is a palette raster.
// This is the bridge: a 29-colour palette derived from the ANSI codes the
// renderer already emits, plus a canvas that can draw text with the hand-made
// 5x7 font. No dependencies, no font files.
import { glyph, drawable, GLYPH_H, ADVANCE, LINE_H as FONT_LINE_H } from './font.js';

const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

// 0 background · 1-4 chrome · 5.. the 8 ANSI hues in base / bright / dim
export const PALETTE = [
  '#0b0e14', '#c9d1d9', '#8b949e', '#30363d', '#1b2330',
  '#3d4250', '#6e7681', '#262b36', // black
  '#e5534b', '#ff7b72', '#7f3a37', // red
  '#3fb950', '#56d364', '#2b6b36', // green
  '#d29922', '#e3b341', '#6f5518', // yellow
  '#2f81f7', '#58a6ff', '#1e4a8a', // blue
  '#bc8cff', '#d2a8ff', '#5f4a80', // magenta
  '#39c5cf', '#56d4dd', '#246f75', // cyan
  '#b1bac4', '#f0f6fc', '#6e7681', // white
].map(hex);

// "unchanged since the previous frame" — a real slot in the (padded) table that
// transparent frames simply never paint.
export const TRANSPARENT = PALETTE.length;

export const C = {
  bg: 0, ink: 1, dim: 2, faint: 3, band: 4,
  hue: (h, mode = 0) => 5 + h * 3 + mode,
};

export function createCanvas(w, h, bg = C.bg) {
  return { w, h, px: new Uint8Array(w * h).fill(bg) };
}

export function rect(cv, x, y, w, h, idx) {
  const x0 = Math.max(0, x), y0 = Math.max(0, y);
  const x1 = Math.min(cv.w, x + w), y1 = Math.min(cv.h, y + h);
  for (let yy = y0; yy < y1; yy++) cv.px.fill(idx, yy * cv.w + x0, yy * cv.w + x1);
}

export function text(cv, x, y, s, idx, scale = 1) {
  let cx = x;
  for (const ch of drawable(s)) {
    const rows = glyph(ch);
    if (!rows) continue;
    for (let gy = 0; gy < GLYPH_H; gy++) {
      const bits = rows[gy];
      if (!bits) continue;
      for (let gx = 0; gx < 5; gx++) {
        if (bits & (1 << (4 - gx))) rect(cv, cx + gx * scale, y + gy * scale, scale, scale, idx);
      }
    }
    cx += ADVANCE * scale;
  }
  return cx;
}

const SGR = /\x1b\[([0-9;]*)m/g;

/** Rasterize ANSI-coloured lines exactly as renderFrame emits them. */
export function ansiLinesToCanvas(cv, lines, x0, y0, { scale = 1, lineH = FONT_LINE_H * scale } = {}) {
  let y = y0;
  for (const line of lines) {
    let hue = null, bright = false, dimmed = false, cx = x0;
    const parts = String(line).split(SGR);
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        for (const p of parts[i].split(';')) {
          const n = Number(p || 0);
          if (n === 0) { hue = null; bright = false; dimmed = false; }
          else if (n === 1) bright = true;
          else if (n === 2) dimmed = true;
          else if (n === 22) { bright = false; dimmed = false; }
          else if (n >= 30 && n <= 37) hue = n - 30;
          else if (n >= 90 && n <= 97) { hue = n - 90; bright = true; }
          else if (n === 39) hue = null;
        }
        continue;
      }
      const idx = hue == null ? (dimmed ? C.dim : C.ink) : C.hue(hue, bright ? 1 : dimmed ? 2 : 0);
      cx = text(cv, cx, y, parts[i], idx, scale);
    }
    y += lineH;
  }
  return y;
}