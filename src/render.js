// Pure frame renderer for spectating a match. Same discipline as tape:
// render(state) -> lines, no side effects, testable headless.
const ANSI = /\x1b\[[0-9;]*m/g;
export const vis = s => String(s).replace(ANSI, '');
export const dim = s => `\x1b[2m${s}\x1b[0m`;
const bold = s => `\x1b[1m${s}\x1b[0m`;
const pad = (s, n) => { const l = vis(s).length; return l >= n ? s : s + ' '.repeat(n - l); };
const cut = (s, n) => { s = String(s); return vis(s).length <= n ? s : s.slice(0, Math.max(0, n - 1)) + '…'; };
const c = (code, s) => `\x1b[${code}m${s}\x1b[0m`;

function hpBar(hp, width = 14) {
  const filled = Math.round((hp / 100) * width);
  const color = hp > 60 ? 32 : hp > 30 ? 33 : 31;
  return c(color, '█'.repeat(filled)) + dim('░'.repeat(width - filled)) + ` ${String(hp).padStart(3)}/100`;
}

function fighter(name, hp, charged, side) {
  const tag = charged ? c(33, '*charged*') : '';
  const lines = [
    `  ${hp <= 0 ? '\\|/' : '\\O/'} ${tag}`,
    `   ${hp <= 0 ? 'x_x' : '|'}   `,
    '  / \\  ',
  ];
  return `${bold(cut(name, 18))}${hp <= 0 ? c(31, '  KO') : ''}\n${lines.join('\n')}\n${hpBar(hp)}`;
}

const MOVE_VERB = {
  strike: 'strikes', heavy: 'unleashes HEAVY', heal: 'heals', charge: 'charges up',
};
const ROPE_VERB = { haul: 'hauls', lunge: 'lunges', lean: 'leans', rest: 'rests' };
const fmtKnot = k => `${k > 0 ? '+' : ''}${k}`;

// A rope replay (rope/1) carries knot/stamina instead of hp/dmg. Detected from
// the game id so empty logs (turn 0) render too.
const isRope = replay => (replay.game || '').startsWith('rope') || (replay.log[0] && replay.log[0].knot !== undefined);

function ropeTurnText(t, players) {
  return [0, 1].map(i => {
    const m = t.moves[i];
    const slip = t.slipped?.[i] ? c(31, ' SLIP!') : '';
    return `${players[i].name} ${ROPE_VERB[m] ?? m}${slip}`;
  }).join(' · ');
}

function renderRopeStory(replay) {
  const { players, seed, log, result } = replay;
  const out = [];
  const verdict = result.winner === 'draw' ? 'DRAW' : `${(result.winner === 'a' ? players[0] : players[1]).name} WINS`;
  out.push(bold(`⚔ ${players[0].name} vs ${players[1].name}`) + dim(` · seed ${seed} · ${replay.game || 'rope/1'} · ${verdict}`));
  out.push('');
  for (const t of log) {
    out.push(dim(`T${String(t.turn).padStart(2)} `) + `${ropeTurnText(t, players)}  ${dim(`knot ${fmtKnot(t.knot)} [${t.stamina[0]}:${t.stamina[1]}]`)}`);
  }
  out.push('');
  out.push(dim(`final knot ${fmtKnot(result.knot)} · stamina ${log[log.length - 1]?.stamina?.join(':') ?? '—'} after ${result.turns} turns${result.stop === 'maxturns' ? ' (turn limit)' : ''}`));
  return out.join('\n');
}

function renderRopeFrame({ replay, turn, w = 80, h = 24 }) {
  const { players, result } = replay;
  const log = replay.log.slice(0, turn);
  const last = log[log.length - 1];
  const stamina = last ? last.stamina : [10, 10];
  const knot = last ? last.knot : 0;
  const lines = [];

  const head = bold('⚔ duel') + dim(` · seed ${replay.seed} · turn ${log.length}/${result.turns} · ${replay.game || 'rope/1'}`);
  const verdict = log.length === result.turns
    ? (result.winner === 'draw' ? c(33, 'DRAW') : c(32, `${(result.winner === 'a' ? players[0] : players[1]).name} WINS`))
    : '';
  lines.push(pad(cut(head + ' ' + verdict, w), w));
  lines.push('');

  // two pullers side by side, stamina bars instead of hp
  const half = Math.floor((w - 3) / 2);
  const stamBar = st => {
    const filled = Math.round((st / 10) * 14);
    const color = st > 6 ? 32 : st > 3 ? 33 : 31;
    return c(color, '█'.repeat(filled)) + dim('░'.repeat(14 - filled)) + ` ${String(st).padStart(2)}/10`;
  };
  const side = i => `${bold(cut(players[i].name, 18))}\n${stamBar(stamina[i])}`.split('\n');
  const A = side(0), B = side(1);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    lines.push(pad(cut(pad(A[i] ?? '', half), half) + dim('┃') + pad(cut(B[i] ?? '', half + 1), half + 1), w));
  }
  lines.push('');

  // the 13-cell rope: knot marker between the two edges (+6 right = A wins)
  const pos = Math.round(Math.max(-6, Math.min(6, knot))) + 6;
  const rope = Array.from({ length: 13 }, (_, i) => (i === pos ? c(32, '●') : '·')).join('');
  lines.push(pad(cut(`A ▏${rope}▕ B   knot ${fmtKnot(knot)}`, w), w));
  lines.push('');

  const shown = log.slice(-8);
  for (const t of shown) {
    lines.push(dim(`T${String(t.turn).padStart(2)} `) + cut(`${ropeTurnText(t, players)}  knot ${fmtKnot(t.knot)}`, w - 4));
  }
  while (lines.length < h - 1) lines.push('');
  lines.push(pad(dim(cut('space pause · ←/→ step · +/- speed · q quit', w)), w));
  return lines.slice(0, h);
}

export function renderStory(replay) {
  if (isRope(replay)) return renderRopeStory(replay);
  const { players, seed, log, result } = replay;
  const out = [];
  const verdict = result.winner === 'draw' ? 'DRAW' : `${(result.winner === 'a' ? players[0] : players[1]).name} WINS`;
  out.push(bold(`⚔ ${players[0].name} vs ${players[1].name}`) + dim(` · seed ${seed} · ${replay.game || 'clash/1'} · ${verdict}`));
  out.push('');
  for (const t of log) {
    const [ma, mb] = t.moves;
    const bits = [];
    const side = (i, m) => {
      const who = players[i].name;
      if (t.dmg[i]) bits.push(`${who} ${MOVE_VERB[m]} for ${t.dmg[i]}${t.recoil[i] ? ` (recoil ${t.recoil[i]})` : ''}`);
      else if (t.heal[i]) bits.push(`${who} heals ${t.heal[i]}`);
      else bits.push(`${who} ${MOVE_VERB[m]}`);
    };
    side(0, ma); side(1, mb);
    out.push(dim(`T${String(t.turn).padStart(2)} `) + `${bits.join(' · ')}  ${dim(`[${t.hp[0]}:${t.hp[1]}]`)}`);
  }
  out.push('');
  out.push(dim(`final ${result.hp[0]}:${result.hp[1]} after ${result.turns} turns${result.stop === 'maxturns' ? ' (turn limit)' : ''}`));
  return out.join('\n');
}

export function renderFrame({ replay, turn, w = 80, h = 24 }) {
  if (isRope(replay)) return renderRopeFrame({ replay, turn, w, h });
  const { players, result } = replay;
  const log = replay.log.slice(0, turn);
  const last = log[log.length - 1];
  const hp = last ? last.hp : [100, 100];
  const charged = last ? last.charged : [false, false];
  const lines = [];

  const head = bold('⚔ duel') + dim(` · seed ${replay.seed} · turn ${log.length}/${result.turns}`);
  const verdict = log.length === result.turns
    ? (result.winner === 'draw' ? c(33, 'DRAW') : c(32, `${(result.winner === 'a' ? players[0] : players[1]).name} WINS`))
    : '';
  lines.push(pad(cut(head + ' ' + verdict, w), w));
  lines.push('');

  // arena: two fighters side by side
  const half = Math.floor((w - 3) / 2);
  const A = fighter(players[0].name, hp[0], charged[0]).split('\n');
  const B = fighter(players[1].name, hp[1], charged[1]).split('\n');
  for (let i = 0; i < A.length; i++) {
    lines.push(pad(cut(pad(A[i] ?? '', half), half) + dim('┃') + pad(cut(B[i] ?? '', half + 1), half + 1), w));
  }
  lines.push('');

  // combat log: latest 8 turns
  const shown = log.slice(-8);
  for (const t of shown) {
    const [ma, mb] = t.moves;
    const parts = [];
    if (t.dmg[0]) parts.push(`${players[0].name} ${MOVE_VERB[ma]} for ${t.dmg[0]}${t.recoil[0] ? c(31, ` (recoil ${t.recoil[0]})`) : ''}`);
    if (t.heal[0]) parts.push(`${players[0].name} heals ${t.heal[0]}`);
    if (t.dmg[1]) parts.push(`${players[1].name} ${MOVE_VERB[mb]} for ${t.dmg[1]}${t.recoil[1] ? c(31, ` (recoil ${t.recoil[1]})`) : ''}`);
    if (t.heal[1]) parts.push(`${players[1].name} heals ${t.heal[1]}`);
    if (ma === 'charge') parts.push(`${players[0].name} ${MOVE_VERB.charge}`);
    if (mb === 'charge') parts.push(`${players[1].name} ${MOVE_VERB.charge}`);
    lines.push(dim(`T${String(t.turn).padStart(2)} `) + cut(parts.join(' · '), w - 4));
  }
  while (lines.length < h - 1) lines.push('');
  lines.push(pad(dim(cut('space pause · ←/→ step · +/- speed · q quit', w)), w));
  return lines.slice(0, h);
}
