// duel stream — watch a match *while it happens*.
//
// `duel watch` is time travel: it replays a finished file. `duel stream` is
// live: agents are asked for their move, and the frame is redrawn the moment
// both answers land. The replay is written at the end, so a streaming session
// leaves the same artefact as any other match.
import { play, agentView, maxTurnsFor, GAMES, DEFAULT_GAME } from './engine.js';
import { askAgent } from './agent.js';
import { renderFrame, vis } from './render.js';

const ESC = '\x1b[';

/** One plain narrative line for the turn that just resolved — CI-friendly. */
export function turnLine(replay, entry) {
  const [a, b] = replay.players.map(p => p.name);
  const [ma, mb] = entry.moves;
  if (entry.knot !== undefined) {
    const bits = [`${a} ${ma}`, `${b} ${mb}`];
    if (entry.slipped?.[0]) bits[0] += ' (slip!)';
    if (entry.slipped?.[1]) bits[1] += ' (slip!)';
    return `T${String(entry.turn).padStart(2, '0')} ${bits.join(' vs ')} · knot ${entry.knot > 0 ? '+' : ''}${entry.knot} [${entry.stamina.join(':')}]`;
  }
  const bits = [];
  if (entry.dmg[0]) bits.push(`${a} ${ma} ${entry.dmg[0]}${entry.recoil[0] ? ` (recoil ${entry.recoil[0]})` : ''}`);
  if (entry.heal[0]) bits.push(`${a} heals ${entry.heal[0]}`);
  if (entry.dmg[1]) bits.push(`${b} ${mb} ${entry.dmg[1]}${entry.recoil[1] ? ` (recoil ${entry.recoil[1]})` : ''}`);
  if (entry.heal[1]) bits.push(`${b} heals ${entry.heal[1]}`);
  if (!bits.length) bits.push(`${a} ${ma} · ${b} ${mb}`);
  return `T${String(entry.turn).padStart(2, '0')} ${bits.join(' · ')} · hp ${entry.hp[0]}:${entry.hp[1]}`;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Stream a live match: ask both agents, then emit the turn.
 *
 *   tty:  redraw the arena frame in place after every turn
 *   pipe: one stable line per turn (greppable, CI-safe) + a frame every N turns
 *
 * `onTurn(replay)` gets the replay-so-far, so callers can persist incrementally.
 */
export async function streamMatch({
  cmdA, cmdB, seed, timeout = 1500, game = DEFAULT_GAME,
  players, delay = 250, every = 0, cols = 80, rows = 24,
  write = s => process.stdout.write(s), isTTY = Boolean(process.stdout.isTTY),
  onTurn = () => {}, sleepFn = sleep,
} = {}) {
  const movesA = [], movesB = [];
  const fails = { a: 0, b: 0 };
  const maxT = maxTurnsFor(game);
  const replay = { version: 1, game, seed, players, moves: [], result: { winner: 'draw', turns: 0 }, log: [] };
  const started = Date.now();

  const emit = (payload, update = false) => {
    if (!isTTY) { write(payload); return; }
    if (update) write(`${ESC}${rows}A`); // move back to the top of the panel
    write(payload);
  };

  if (isTTY) write(`${ESC}?25l`); // hide cursor while streaming
  try {
    let drawn = 0;
    for (let t = 0; t < maxT; t++) {
      let sim = play(seed, movesA, movesB, game);
      if (sim.result.stop !== 'moves') break; // already decided
      const [ra, rb] = await Promise.all([
        askAgent(cmdA, agentView(sim.log, 0, t + 1, game), timeout),
        askAgent(cmdB, agentView(sim.log, 1, t + 1, game), timeout),
      ]);
      if (!ra.ok) fails.a++;
      if (!rb.ok) fails.b++;
      movesA.push(ra.move); movesB.push(rb.move);

      sim = play(seed, movesA, movesB, game);
      replay.moves = movesA.map((m, i) => [m, movesB[i]]);
      replay.log = sim.log;
      replay.result = sim.result;
      const entry = sim.log[sim.log.length - 1];
      // While the match is still undecided, result.turns == log.length, which
      // would make the frame believe it is over and print a winner. Show the
      // real horizon instead.
      const shown = {
        ...replay,
        result: { ...sim.result, turns: sim.result.stop === 'moves' ? maxT : sim.result.turns },
      };

      if (isTTY) {
        const frame = renderFrame({ replay: shown, turn: sim.log.length, w: cols, h: rows }).join('\n');
        emit(frame + '\n', drawn > 0);
        drawn++;
      } else {
        write(turnLine(replay, entry) + '\n');
        if (every > 0 && (t + 1) % every === 0 && sim.result.stop === 'moves') {
          write(renderFrame({ replay: shown, turn: sim.log.length, w: cols, h: rows }).map(vis).join('\n') + '\n');
        }
      }
      onTurn(replay);
      if (delay) await sleepFn(delay);
      if (sim.result.stop !== 'moves') break;
    }
    // settle the result for matches that ended on the turn limit
    replay.result = play(seed, movesA, movesB, game).result;
    replay.log = play(seed, movesA, movesB, game).log;

    const verdict = replay.result.winner === 'draw'
      ? 'draw'
      : `${(replay.result.winner === 'a' ? players[0] : players[1]).name} wins`;
    const score = GAMES[game]?.rope
      ? `knot ${replay.result.knot > 0 ? '+' : ''}${replay.result.knot}`
      : `hp ${replay.result.hp[0]}:${replay.result.hp[1]}`;
    if (isTTY) {
      write(`\n${ESC}?25h⚔ ${players[0].name} vs ${players[1].name} · ${verdict} — ${score} · ${replay.result.turns} turns · ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
    } else {
      write(`⚔ ${players[0].name} vs ${players[1].name} · ${verdict} — ${score} · ${replay.result.turns} turns\n`);
    }
  } finally {
    if (isTTY) write(`${ESC}?25h`);
  }
  return { replay, fails, elapsedMs: Date.now() - started };
}

/**
 * Stream an already-recorded replay the same way (a "live" rerun of the past).
 * Handy for demos and screencasts: `duel stream match.json --delay 400`.
 */
export async function streamReplay({
  replay, delay = 400, write = s => process.stdout.write(s),
  isTTY = Boolean(process.stdout.isTTY), cols = 80, rows = 24, sleepFn = sleep,
} = {}) {
  const total = replay.result.turns;
  if (isTTY) write(`${ESC}?25l`);
  try {
    for (let turn = 0; turn <= total; turn++) {
      const frame = renderFrame({ replay, turn, w: cols, h: rows }).join('\n');
      if (isTTY) write(`${turn === 0 ? '' : `${ESC}${rows}A`}${frame}\n`);
      else write(renderFrame({ replay, turn, w: cols, h: rows, hint: false }).map(vis).join('\n') + '\n');
      if (delay && turn < total) await sleepFn(delay);
    }
  } finally {
    if (isTTY) write(`${ESC}?25h\n`);
  }
}