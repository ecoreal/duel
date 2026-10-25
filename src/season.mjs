// `duel season <agent...>` — the weekly ladder: seeds derive from the ISO
// week number, so everyone on Earth runs the SAME matches this week.
// Post your table with #duel-season.
import { runLadder } from './elo.js';
import { agentName } from './agent.js';

export function seasonSeed(date = new Date()) {
  // ISO week number (portable, no deps)
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round((d - firstThursday) / 604800000);
  return d.getUTCFullYear() * 100 + week;
}

export async function runSeason(agents, playMatch, weekSeed = seasonSeed()) {
  const ladder = await runLadder(agents, (A, B, i) => playMatch(A, B, weekSeed * 1000 + i));
  return { weekSeed, ...ladder };
}
