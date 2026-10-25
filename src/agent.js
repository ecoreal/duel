// An agent is any executable: it receives the match state as JSON on stdin
// and must print {"move":"strike|heavy|heal|charge"} on stdout. That's the
// whole protocol — bash, python, a curl-to-LLM script, anything can fight.
// Failures are never fatal: a dead, slow or delinquent agent just jabs.
import { spawn } from 'node:child_process';
import { builtinBot } from './builtin.js';
import { validMove } from './engine.js';

export function agentName(cmd) {
  if (cmd.startsWith('builtin:')) return cmd.slice(8);
  return cmd.split('/').pop().replace(/\.[a-z]+$/i, '');
}

export async function askAgent(cmd, view, timeoutMs = 1500) {
  if (cmd.startsWith('builtin:')) {
    return { move: validMove(builtinBot(cmd.slice(8), view)), ok: true, raw: '' };
  }
  return new Promise(resolve => {
    let child;
    try {
      child = spawn('sh', ['-c', cmd], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      return resolve({ move: 'strike', ok: false, raw: String(e) });
    }
    let out = '', settled = false;
    const finish = (move, ok, raw) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ move: validMove(move), ok, raw: String(raw).slice(0, 200) });
    };
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      finish('strike', false, '(timeout)');
    }, timeoutMs);
    // spawn errors (ENOENT) and EPIPE when the child dies before we write
    child.on('error', err => finish('strike', false, err.message || err));
    child.stdout.on('data', d => (out += d));
    child.on('close', () => {
      const m = out.match(/"move"\s*:\s*"([a-z]+)"/);
      if (m) finish(m[1], true, out);
      else finish('strike', false, out.trim() || '(no output)');
    });
    child.stdin.on('error', () => {}); // EPIPE after early exit — close() handles it
    try {
      child.stdin.write(JSON.stringify(view));
      child.stdin.end();
    } catch {}
  });
}
