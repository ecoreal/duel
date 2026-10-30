// Replays are the product: a tiny JSON file (seed + moves + result) that the
// engine can re-simulate exactly. Share a match like you share a gist.
import { readFileSync, writeFileSync } from 'node:fs';
import { play, DEFAULT_GAME } from './engine.js';

export function saveReplay(path, { seed, players, movesA, movesB, game = DEFAULT_GAME, bans = [] }) {
  const { log, result } = play(seed, movesA, movesB, game, bans);
  const replay = {
    version: 1,
    game,
    seed,
    players, // [{name}, {name}]
    // only written when a draft happened, so plain replays stay byte-identical
    ...(bans && bans.length ? { bans } : {}),
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

// integrity: re-simulating seed+moves under the replay's own ruleset must
// reproduce the stored log — clash/1 replays verify under clash/1 forever
export function verifyReplay(replay) {
  const { log } = play(replay.seed, replay.moves.map(m => m[0]), replay.moves.map(m => m[1]), replay.game, replay.bans || []);
  return JSON.stringify(log) === JSON.stringify(replay.log);
}
