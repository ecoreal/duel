// The draft: before a match, each side bans one move. The seed decides who
// bans first (so a series alternates the advantage), and a ban removes the move
// for BOTH fighters — which is the point: a draft is a conversation about what
// kind of game you are about to play.
import { askAgent } from './agent.js';
import { banView, legalBans, clampBans, DEFAULT_GAME } from './engine.js';

/**
 * Run a draft. Returns the ban list (engine-clamped), who banned what, and the
 * number of failed/late ban replies per side (a failed ban is a legal ban, so
 * the match still happens).
 */
export async function runDraft({ cmdA, cmdB, seed, game = DEFAULT_GAME, timeout = 1500 } = {}) {
  const bans = [];
  const picks = [];
  const fails = { a: 0, b: 0 };
  const first = Math.abs(seed) % 2; // deterministic: the seed decides the order
  for (const you of [first, 1 - first]) {
    const legal = legalBans(game, bans); // never draft a game out of existence
    if (!legal.length) break;
    const view = banView({ you, gameId: game, bans, turn: picks.length + 1, seed });
    const r = await askAgent(you === 0 ? cmdA : cmdB, view, timeout);
    if (!r.ok) fails[you === 0 ? 'a' : 'b']++;
    const ban = r.ban && legal.includes(r.ban) ? r.ban : legal[0];
    bans.push(ban);
    picks.push({ side: you, ban });
  }
  return { bans: clampBans(game, bans), picks, fails, first };
}

/** One line for the CLI/logs: `draft: A bans heavy · B bans heal (A first)`. */
export function draftLine(picks, names, first) {
  if (!picks.length) return '';
  const bits = picks.map(p => `${names[p.side]} bans ${p.ban}`);
  return `🎲 draft: ${bits.join(' · ')} (${names[first]} first)`;
}
