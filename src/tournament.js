// Single-elimination brackets. Seeding is a deterministic shuffle from the
// tournament seed (makeRng — never Math.random); byes pad to a power of two
// and always fall to the shuffled-first agents.
import { makeRng } from './engine.js';

export function seedBracket(names, seed) {
  const rng = makeRng(seed);
  const arr = [...names];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  let size = 1;
  while (size < arr.length) size *= 2;
  // byes occupy odd positions only, so no pair ever meets two byes
  const slots = Array(size).fill(null);
  let byes = size - arr.length, ai = 0;
  for (let i = 0; i < size; i++) {
    if (i % 2 === 1 && byes > 0) { byes--; continue; }
    slots[i] = arr[ai++];
  }
  return { slots, size };
}

// playMatch(A, B, matchIndex) -> { winnerName, seed, movesA, movesB, result }
export async function runTournament(agents, playMatch, seed) {
  const { slots } = seedBracket(agents, seed);
  const rounds = [];
  let current = slots;
  let matchCounter = 0;
  while (current.length > 1) {
    const matches = [];
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      const A = current[i], B = current[i + 1];
      if (A && B) {
        const r = await playMatch(A, B, matchCounter++);
        matches.push({ a: A.name, b: B.name, winner: r.winnerName, seed: r.seed, moves: r.moves });
        next.push(r.winnerName === A.name ? A : B);
      } else if (A || B) {
        const bye = A || B;
        matches.push({ a: bye.name, b: null, winner: bye.name, seed: null, moves: null });
        next.push(bye);
      } else {
        next.push(null); // unreachable with odd-position byes; kept safe
      }
    }
    rounds.push({ round: rounds.length + 1, matches });
    current = next;
  }
  return { rounds, champion: current[0] };
}

export function renderBracket(tournament) {
  const out = [];
  for (const r of tournament.rounds) {
    const label = r.round === tournament.rounds.length ? `final` : `round ${r.round}`;
    out.push(`${label}`);
    for (const m of r.matches) {
      const pair = `${m.a.padEnd(16)} vs ${(m.b ?? '(bye)').padEnd(16)}`;
      out.push(`  ${pair} → ${m.winner}`);
    }
  }
  out.push(`champion: ${tournament.champion.name}`);
  return out.join('\n');
}
