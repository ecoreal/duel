// Standard ELO, K=32. Ratings live in ladder.json next to where you run duel.
export const expected = (ra, rb) => 1 / (1 + 10 ** ((rb - ra) / 400));
export const K = 32;

export function update(ra, rb, scoreA) {
  const ea = expected(ra, rb);
  const round = x => Math.round(x * 10) / 10;
  return [round(ra + K * (scoreA - ea)), round(rb + K * (1 - scoreA - (1 - ea)))];
}

export async function runLadder(agents, playMatch) {
  // agents: [{name, cmd}] — everyone fights everyone twice, sides swapped.
  // playMatch(A, B) -> { winner: 'a'|'b'|'draw', turns, seed }
  const ratings = new Map(agents.map(a => [a.name, 1200]));
  const record = new Map(agents.map(a => [a.name, { w: 0, l: 0, d: 0 }]));
  const matches = [];
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      for (const swap of [false, true]) {
        const A = swap ? agents[j] : agents[i];
        const B = swap ? agents[i] : agents[j];
        const result = await playMatch(A, B);
        const scoreA = result.winner === 'a' ? 1 : result.winner === 'b' ? 0 : 0.5;
        const [na, nb] = update(ratings.get(A.name), ratings.get(B.name), scoreA);
        ratings.set(A.name, na); ratings.set(B.name, nb);
        const win = scoreA === 1 ? A.name : scoreA === 0 ? B.name : null;
        if (win) {
          record.get(win).w++;
          record.get(scoreA === 1 ? B.name : A.name).l++;
        } else {
          record.get(A.name).d++; record.get(B.name).d++;
        }
        matches.push({ a: A.name, b: B.name, winner: result.winner, turns: result.turns, seed: result.seed });
      }
    }
  }
  return {
    table: agents
      .map(a => ({ name: a.name, rating: ratings.get(a.name), ...record.get(a.name) }))
      .sort((x, y) => y.rating - x.rating),
    matches,
  };
}
