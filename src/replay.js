// Replays are the product: a tiny JSON file (seed + moves + result) that the
// engine can re-simulate exactly. Share a match like you share a gist.
import { readFileSync, writeFileSync } from 'node:fs';
import { play } from './engine.js';

export function saveReplay(path, { seed, players, movesA, movesB }) {
  const { log, result } = play(seed, movesA, movesB);
  const replay = {
    version: 1,
    game: 'clash/1',
    seed,
    players, // [{name}, {name}]
    moves: movesA.map((m, i) => [m, movesB[i]]),
    result,
    log,
  };
  writeFileSync(path, JSON.stringify(replay, null, 2) + '\n');
  return replay;
}

export function loadReplay(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// integrity: re-simulating seed+moves must reproduce the stored log
export function verifyReplay(replay) {
  const { log } = play(replay.seed, replay.moves.map(m => m[0]), replay.moves.map(m => m[1]));
  return JSON.stringify(log) === JSON.stringify(replay.log);
}
