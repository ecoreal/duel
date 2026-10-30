// An agent is any executable: it receives the match state as JSON on stdin
// and must print {"move":"strike|heavy|heal|charge"} on stdout. That's the
// whole protocol — bash, python, a curl-to-LLM script, anything can fight.
// Failures are never fatal: a dead, slow or delinquent agent just jabs.
// A "ghost" is a recorded replay fighting again: ghost:<file>:<0|1>.
import { spawn } from 'node:child_process';
import { builtinBot } from './builtin.js';
import { validMove, defaultMove } from './engine.js';
import { loadReplay } from './replay.js';

const ghostCache = new Map();

export function agentName(cmd) {
  if (cmd.startsWith('builtin:')) return cmd.slice(8);
  if (cmd.startsWith('ghost:')) {
    const { file, side } = parseGhost(cmd);
    const base = file.split(/[/\\]/).pop().replace(/\.[a-z]+$/i, '');
    return `${base}-ghost${side}`;
  }
  return cmd.split(/[/\\]/).pop().replace(/\.[a-z]+$/i, '');
}

// ghost:<file>:<0|1> — the file part may itself contain colons (C:\… on Windows)
function parseGhost(cmd) {
  const rest = cmd.slice(6);
  const m = rest.match(/^(.*):([01])$/);
  return m ? { file: m[1], side: Number(m[2]) } : { file: rest, side: 0 };
}

function ghostMove(cmd, view) {
  const { file, side } = parseGhost(cmd);
  if (!ghostCache.has(file)) {
    try { ghostCache.set(file, loadReplay(file)); } catch { ghostCache.set(file, null); }
  }
  const replay = ghostCache.get(file);
  if (!replay) return { move: defaultMove(view.game), ok: false, raw: '(ghost: unreadable replay)' };
  const pair = replay.moves[view.turn - 1];
  if (!pair) return { move: defaultMove(view.game), ok: false, raw: '(ghost: out of recorded moves)' };
  return { move: validMove(pair[side], view.game, view.banned || []), ok: true, raw: '' };
}

export async function askAgent(cmd, view, timeoutMs = 1500) {
  // `phase: 'ban'` asks the agent to remove a move instead of playing one. Any
  // executable therefore answers bans through the same stdin/stdout contract.
  if (view.phase === 'ban') return askBan(cmd, view, timeoutMs);
  if (cmd.startsWith('builtin:')) {
    const bot = builtinBot(cmd.slice(8), view);
    return { move: validMove(bot, view.game, view.banned || []), ok: true, raw: '' };
  }
  if (cmd.startsWith('ghost:')) {
    return ghostMove(cmd, view);
  }
  return new Promise(resolve => {
    let child;
    try {
      child = spawn('sh', ['-c', cmd], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      return resolve({ move: defaultMove(view.game), ok: false, raw: String(e) });
    }
    let out = '', settled = false;
    const finish = (move, ok, raw) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ move: validMove(move, view.game, view.banned || []), ok, raw: String(raw).slice(0, 200) });
    };
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      finish(defaultMove(view.game), false, '(timeout)');
    }, timeoutMs);
    // spawn errors (ENOENT) and EPIPE when the child dies before we write
    child.on('error', err => finish(defaultMove(view.game), false, err.message || err));
    child.stdout.on('data', d => (out += d));
    child.on('close', () => {
      const m = out.match(/"move"\s*:\s*"([a-z]+)"/);
      if (m) finish(m[1], true, out);
      else finish(defaultMove(view.game), false, out.trim() || '(no output)');
    });
    child.stdin.on('error', () => {}); // EPIPE after early exit — close() handles it
    try {
      child.stdin.write(JSON.stringify(view));
      child.stdin.end();
    } catch {}
  });
}

// Ban phase: ask for `{"ban": "<move>"}`. The reply is validated against the
// legal set, so a silly or hostile ban can never remove the last move.
// builtin bots choose for themselves: they ban whatever hurts them most.
export async function askBan(cmd, view, timeoutMs = 1500) {
  const legal = view.moves;
  if (!legal.length) return { ban: null, ok: true, raw: '(nothing left to ban)' };
  if (cmd.startsWith('builtin:')) {
    return { ban: builtinBan(cmd.slice(8), view), ok: true, raw: '' };
  }
  // a ghost is a recording: it has no opinion about a draft it never played
  if (cmd.startsWith('ghost:')) return { ban: legal[0], ok: true, raw: '(ghost: no draft opinion)' };
  return new Promise(resolve => {
    let child;
    try {
      child = spawn('sh', ['-c', cmd], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch {
      return resolve({ ban: legal[0], ok: false, raw: '(spawn failed)' });
    }
    let out = '', settled = false;
    const finish = (ban, ok, raw) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const pick = legal.includes(ban) ? ban : legal[0];
      resolve({ ban: pick, ok, raw: String(raw).slice(0, 200) });
    };
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} finish(legal[0], false, '(timeout)'); }, timeoutMs);
    child.on('error', err => finish(legal[0], false, err.message || err));
    child.stdout.on('data', d => (out += d));
    child.on('close', () => {
      const m = out.match(/"ban"\s*:\s*"([a-z]+)"/);
      if (m) finish(m[1], true, out);
      else finish(legal[0], false, out.trim() || '(no output)');
    });
    child.stdin.on('error', () => {});
    try { child.stdin.write(JSON.stringify(view)); child.stdin.end(); } catch {}
  });
}

// What a sparring partner bans, per game. Deterministic (no RNG): a builtin is
// a yardstick, and a yardstick that wobbles measures nothing.
function builtinBan(name, view) {
  const legal = view.moves;
  const wish = view.game === 'rope/1'
    ? { 'rope-greedy': 'lunge', random: 'lean' }
    : { greedy: 'heavy', berserker: 'heal', patient: 'heavy', adapt: 'charge', random: 'heal' };
  const want = wish[name] ?? wish[name.replace(/#\d+$/, '')] ?? null;
  if (want && legal.includes(want)) return want;
  return legal[0];
}
