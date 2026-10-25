// `duel adopt` — import a replay from a gist, a raw URL, or a local file.
// Every adopted replay is re-simulated before it's trusted: no fake matches.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadReplay, verifyReplay } from './replay.js';

// pure: map a user-facing URL/path to a fetch target
export function resolveSource(input) {
  const gist = input.match(/^https?:\/\/gist\.github\.com\/[^/]+\/([0-9a-f]+).*$/i);
  if (gist) return { kind: 'gist-api', href: `https://api.github.com/gists/${gist[1]}` };
  if (/^https?:\/\//i.test(input)) return { kind: 'http', href: input };
  return { kind: 'file', href: input };
}

async function fetchText(src) {
  if (src.kind === 'file') return readFileSync(src.href, 'utf8');
  const res = await fetch(src.href, {
    headers: src.kind === 'gist-api' ? { accept: 'application/vnd.github+json' } : {},
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${src.href}`);
  if (src.kind === 'gist-api') {
    const gist = await res.json();
    const entry = Object.values(gist.files || {}).find(f => f.filename?.endsWith('.json') || f.type === 'application/json');
    if (!entry) throw new Error('gist contains no .json file');
    return entry.content;
  }
  return res.text();
}

export async function adopt(input, outPath) {
  const src = resolveSource(input);
  const text = await fetchText(src);
  let replay;
  try { replay = JSON.parse(text); } catch { throw new Error('not valid JSON'); }
  if (!replay.seed || !Array.isArray(replay.moves)) throw new Error('not a duel replay (need seed + moves)');
  if (!verifyReplay(replay)) throw new Error('replay failed integrity check — moves do not reproduce the stored log');
  writeFileSync(outPath, JSON.stringify(replay, null, 2) + '\n');
  return replay;
}
