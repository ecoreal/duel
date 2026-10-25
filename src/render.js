// Pure frame renderer for spectating a match. Same discipline as tape:
// render(state) -> lines, no side effects, testable headless.
const ANSI = /\x1b\[[0-9;]*m/g;
export const vis = s => String(s).replace(ANSI, '');
const dim = s => `\x1b[2m${s}\x1b[0m`;
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

export function renderFrame({ replay, turn, w = 80, h = 24 }) {
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
