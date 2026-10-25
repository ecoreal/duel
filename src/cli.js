import { play, agentView, maxTurnsFor, DEFAULT_GAME, GAMES } from './engine.js';
import { askAgent, agentName } from './agent.js';
import { saveReplay, loadReplay, verifyReplay } from './replay.js';
import { runLadder } from './elo.js';
import { renderFrame, vis, dim } from './render.js';
import { watch } from './tui.js';
import { writeFileSync } from 'node:fs';

const VERSION = '0.1.0';
const HELP = `⚔ duel ${VERSION} — a deterministic AI agent arena in your terminal

usage:
  duel run <agentA> <agentB> [--seed N] [--game clash/2|rope/1] [--timeout MS] [--json]
  duel watch <replay.json>            spectate with playback controls
  duel frame <replay.json> [turn]     render one frame to stdout (--plain)
  duel eval <A> <B> [--games 50]      statistical matchup report (sides swapped)
  duel season <agent...>              weekly ladder — same seeds for everyone
  duel tournament <agent...>          single-elimination bracket (--seed, --best)
  duel film <replay> [--every 3]      arena storyboard frames (paste-ready)
  duel rules [game]                   print the rulesets
  duel ladder <agent...>              round-robin, ELO table -> ladder.json
  duel adopt <gist-url|file>          import + verify a replay; fight its ghost
  duel bots                           where the sample bots live

an agent is any executable: it reads the match state as JSON on stdin
and prints {"move":"<one of view.moves>"} on stdout.
built-in opponents: builtin:random  builtin:greedy  builtin:rope-greedy`;

function parseFlags(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') flags.seed = Number(argv[++i]);
    else if (a === '--game') flags.game = argv[++i];
    else if (a === '--best') flags.best = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--games') flags.games = Number(argv[++i]);
    else if (a === '--week') flags.week = Number(argv[++i]);
    else if (a === '--every') flags.every = Number(argv[++i]);
    else if (a === '--height') flags.height = Number(argv[++i]);
    else if (a === '--out') flags.out = argv[++i];
    else if (a === '--timeout') flags.timeout = Number(argv[++i]);
    else if (a === '--json') flags.json = true;
    else if (a === '--plain') flags.plain = true;
    else if (a === '--width') flags.width = Number(argv[++i]);
    else if (a === '--height') flags.height = Number(argv[++i]);
    else if (a === '-h' || a === '--help') flags.help = true;
    else flags._.push(a);
  }
  return flags;
}

// Drives the engine turn by turn, asking each agent for its move.
// Exported for tests: the real end-to-end path (per-game turn limit included).
export async function runMatch(cmdA, cmdB, { seed, timeout, game = DEFAULT_GAME }) {
  const movesA = [], movesB = [];
  const fails = { a: 0, b: 0 };
  const maxT = maxTurnsFor(game);
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
  }
  return { seed, movesA, movesB, fails, game };
}

// per-game score line: clash shows HP, rope shows where the knot leans
const scoreOf = (game, result) => GAMES[game]?.rope
  ? `knot ${result.knot > 0 ? '+' : ''}${result.knot}`
  : `hp ${result.hp[0]}:${result.hp[1]}`;

export async function main(argv) {
  const [cmd, ...rest] = argv;
  const flags = parseFlags(rest);
  if (!cmd || flags.help) { console.log(HELP); process.exitCode = cmd ? 0 : 1; return; }

  if (cmd === 'bots') {
    console.log(`sample bots ship with the repo:
  bots/random.sh    — 4 lines of bash
  bots/greedy.mjs   — a deterministic strategy in plain JS
  bots/llm.mjs      — an LLM fighter (needs an API key, use --timeout 8000)
try: duel run bots/greedy.mjs builtin:random --seed 7`);
    return;
  }

  if (cmd === 'adopt') {
    const [input] = flags._;
    if (!input) { console.error('duel adopt: need a gist URL, raw URL, or local file'); process.exitCode = 1; return; }
    const name = input.split('/').pop().replace(/\.(json|txt)$/i, '') || 'replay';
    const out = flags.out || `adopted-${name.replace(/[^a-z0-9-]/gi, '')}.json`;
    try {
      const { adopt } = await import('./adopt.js');
      const replay = await adopt(input, out);
      const { result, players } = replay;
      console.log(`✅ adopted ${players?.map(p => p.name).join(' vs ')} (seed ${replay.seed}, ${result.turns} turns, ${replay.game || 'clash/1'}) → ${out}`);
      console.log(`   spectate: duel watch ${out}`);
      console.log(`   fight its ghost: duel run ghost:${out}:0 builtin:greedy`);
    } catch (e) {
      console.error(`adopt failed: ${e.message}`);
      process.exitCode = 1;
    }
    return;
  }

  if (cmd === 'run') {
    const [a, b] = flags._;
    if (!a || !b) { console.error('duel run: need two agents\n' + HELP); process.exitCode = 1; return; }
    const seed = flags.seed ?? (Date.now() & 0x7fffffff);
    const timeout = flags.timeout ?? 1500;
    const game = flags.game || DEFAULT_GAME;
    const best = flags.best ?? 1;
    if (best > 1) {
      // series: sides swap every game, seeds advance — variance can't hide
      const [nameA, nameB] = [agentName(a), agentName(b)];
      let ca = 0, cb = 0, cd = 0;
      const prefix = flags.out ? flags.out.replace(/\.json$/, '') : `duel-${seed}`;
      for (let g = 0; g < best; g++) {
        const swap = g % 2 === 1;
        const A = swap ? b : a, B = swap ? a : b;
        const s = seed + g;
        const { movesA, movesB } = await runMatch(A, B, { seed: s, timeout, game });
        const r = play(s, movesA, movesB, game).result;
        const winnerCorner = r.winner === 'a' ? (swap ? 'b' : 'a') : r.winner === 'b' ? (swap ? 'a' : 'b') : 'd';
        if (winnerCorner === 'a') ca++; else if (winnerCorner === 'b') cb++; else cd++;
        saveReplay(`${prefix}-g${g + 1}.json`, { seed: s, players: [{ name: agentName(A) }, { name: agentName(B) }], movesA, movesB, game });
        const wn = winnerCorner === 'a' ? nameA : winnerCorner === 'b' ? nameB : 'draw';
        console.log(dim(`  game ${g + 1}: ${wn} (${scoreOf(game, r)}) → ${prefix}-g${g + 1}.json`));
      }
      console.log(`⚔ best-of-${best}: ${nameA} ${ca} — ${cb} ${nameB}${cd ? ` (${cd} draw)` : ''}`);
      console.log(`   ${ca === cb ? 'series drawn' : ca > cb ? `${nameA} takes the series` : `${nameB} takes the series`}`);
      return;
    }
    const { movesA, movesB, fails } = await runMatch(a, b, { seed, timeout, game });
    const players = [{ name: agentName(a) }, { name: agentName(b) }];
    const out = flags.out || `duel-${seed}.json`;
    const replay = saveReplay(out, { seed, players, movesA, movesB, game });
    if (!verifyReplay(replay)) console.error('warning: replay failed integrity check');
    if (flags.json) { console.log(JSON.stringify({ ...replay, log: undefined })); return; }
    const { result } = replay;
    const verdict = result.winner === 'draw' ? 'draw' : `${(result.winner === 'a' ? players[0] : players[1]).name} wins`;
    console.log(`⚔ ${players[0].name} vs ${players[1].name} · seed ${seed} · ${result.turns} turns`);
    console.log(`   ${verdict} — ${scoreOf(game, result)}${result.stop === 'maxturns' ? ' (turn limit)' : ''}`);
    const hesitations = Object.entries(fails).filter(([, n]) => n > 0).map(([side, n]) => `${(side === 'a' ? players[0] : players[1]).name}: ${n} jab${n === 1 ? '' : 's'} (invalid/late move)`);
    if (hesitations.length) console.log(`   ⚠ ${hesitations.join(' · ')}`);
    console.log(`💾 replay → ${out}   spectate: duel watch ${out}`);
    return;
  }

  if (cmd === 'watch') {
    const [file] = flags._;
    if (!file) { console.error('duel watch: need a replay file'); process.exitCode = 1; return; }
    await watch(loadReplay(file), renderFrame);
    return;
  }

  if (cmd === 'tournament') {
    const cmds = flags._;
    if (cmds.length < 2) { console.error('duel tournament: need at least two agents'); process.exitCode = 1; return; }
    const { runTournament, renderBracket } = await import('./tournament.js');
    const seed = flags.seed ?? (Date.now() & 0x7fffffff);
    const timeout = flags.timeout ?? 1500;
    const game = flags.game || DEFAULT_GAME;
    const agents = cmds.map(c => ({ name: agentName(c), cmd: c }));
    const seen = new Map();
    for (const a of agents) {
      const n = seen.get(a.name) ?? 0;
      seen.set(a.name, n + 1);
      if (n > 0) a.name = `${a.name}#${n + 1}`;
    }
    const best = flags.best ?? 1;
    console.log(`🥇 bracket · seed ${seed} · ${game}${best > 1 ? ` · best-of-${best}` : ''}`);
    const t = await runTournament(agents, async (A, B, matchIndex) => {
      // best-of with side rotation, then sudden death until someone leads
      let ca = 0, cb = 0, g = 0, lastSeed = null, lastMoves = null;
      const need = best;
      while (ca === cb || g < need) {
        if (g >= need && ca !== cb) break;
        const swap = (g + matchIndex) % 2 === 1;
        const AG = swap ? B : A, BG = swap ? A : B;
        const s = seed + matchIndex * 100 + g;
        const { movesA, movesB } = await runMatch(AG.cmd, BG.cmd, { seed: s, timeout, game });
        const r = play(s, movesA, movesB, game).result;
        lastSeed = s;
        lastMoves = swap ? [movesB, movesA] : [movesA, movesB]; // canonical corner order
        const corner = r.winner === 'a' ? (swap ? 'b' : 'a') : r.winner === 'b' ? (swap ? 'a' : 'b') : 'd';
        if (corner === 'a') ca++; else if (corner === 'b') cb++;
        g++;
        if (g > need + 8) break; // paranoia valve
      }
      return { winnerName: ca > cb ? A.name : B.name, seed: lastSeed, moves: { a: lastMoves[0], b: lastMoves[1] } };
    }, seed);
    console.log(renderBracket(t));
    const outFile = flags.out || 'tournament.json';
    writeFileSync(outFile, JSON.stringify({ seed, game, best, champion: t.champion.name, rounds: t.rounds }, null, 2));
    console.log(`💾 ${outFile}`);
    return;
  }

  if (cmd === 'rules') {
    const { GAMES } = await import('./engine.js');
    const which = flags._[0];
    for (const [id, r] of Object.entries(GAMES)) {
      if (which && which !== id) continue;
      console.log(`${id} — ${r.blurb.join('\n        ')}`);
    }
    return;
  }

  if (cmd === 'season') {
    const cmds = flags._;
    if (cmds.length < 2) { console.error('duel season: need at least two agents — same seeds for everyone this week'); process.exitCode = 1; return; }
    const { runSeason, seasonSeed } = await import('./season.mjs');
    const agents = cmds.map(c => ({ name: agentName(c), cmd: c }));
    const seen = new Map();
    for (const a of agents) {
      const n = seen.get(a.name) ?? 0;
      seen.set(a.name, n + 1);
      if (n > 0) a.name = `${a.name}#${n + 1}`;
    }
    const timeout = flags.timeout ?? 1500;
    const game = flags.game || DEFAULT_GAME;
    const week = flags.week ? Number(flags.week) : seasonSeed();
    const { table, matches, weekSeed } = await runSeason(agents, async (A, B, i) => {
      const seed = week * 1000 + i;
      const { movesA, movesB } = await runMatch(A.cmd, B.cmd, { seed, timeout, game });
      const { result } = play(seed, movesA, movesB, game);
      return { winner: result.winner, turns: result.turns, seed };
    }, week);
    const outFile = flags.out || 'season.json';
    writeFileSync(outFile, JSON.stringify({ week: weekSeed, updated: new Date().toISOString(), table, matches }, null, 2));
    console.log(`🏆 season ${weekSeed} — seeds ${weekSeed * 1000}+ (same for everyone this week)`);
    console.log('rank agent               elo    w  l  d');
    table.forEach((r, i) => console.log(`${String(i + 1).padStart(4)} ${r.name.padEnd(20)} ${String(r.rating).padStart(6)}  ${String(r.w).padStart(2)} ${String(r.l).padStart(2)} ${String(r.d).padStart(2)}`));
    console.log('\n💾 season.json · post it with #duel-season');
    return;
  }

  if (cmd === 'eval') {
    const [a, b] = flags._;
    if (!a || !b) { console.error('duel eval: need two agents — duel eval A B [--games 50] [--seed 100]'); process.exitCode = 1; return; }
    const games = Math.max(2, flags.games ?? 50);
    const seedBase = flags.seed ?? 100;
    const timeout = flags.timeout ?? 1500;
    const game = flags.game || DEFAULT_GAME;
    const [nameA, nameB] = [agentName(a), agentName(b)];
    let wa = 0, wb = 0, dr = 0, turns = 0, jabs = 0;
    for (let g = 0; g < games; g++) {
      const swap = g % 2 === 1;
      const A = swap ? b : a, B = swap ? a : b;
      const seed = seedBase + Math.floor(g / 2);
      const { movesA, movesB, fails } = await runMatch(A, B, { seed, timeout, game });
      const r = play(seed, movesA, movesB, game).result;
      turns += r.turns;
      jabs += fails.a + fails.b;
      const corner = r.winner === 'a' ? (swap ? 'b' : 'a') : r.winner === 'b' ? (swap ? 'a' : 'b') : 'd';
      if (corner === 'a') wa++; else if (corner === 'b') wb++; else dr++;
    }
    const pct = n => (100 * n / games).toFixed(1).padStart(5) + '%';
    console.log(`⚔ eval · ${nameA} vs ${nameB} · ${games} games (sides swapped, seeds ${seedBase}+) · ${game}`);
    console.log(`   ${nameA.padEnd(20)} ${pct(wa)}   ${nameB.padEnd(20)} ${pct(wb)}${dr ? `   draws ${pct(dr)}` : ''}`);
    console.log(dim(`   avg ${turns / games} turns/game · ${jabs} invalid/late moves`));
    return;
  }

  if (cmd === 'film') {
    const [file] = flags._;
    if (!file) { console.error('duel film: need a replay file'); process.exitCode = 1; return; }
    const every = Math.max(1, flags.every ?? 3);
    const replay = loadReplay(file);
    const total = replay.result.turns;
    const stops = [];
    for (let t = every; t <= total; t += every) stops.push(t);
    if (stops[stops.length - 1] !== total) stops.push(total);
    // highlight turns: biggest single hit + the final turn (rope logs have no dmg)
    let biggest = { turn: 1, dmg: 0 };
    for (const t of replay.log) for (const d of (t.dmg ?? [])) if (d > biggest.dmg) biggest = { turn: t.turn, dmg: d };
    console.log(dim(`⚔ duel film · ${file} · ${stops.length} frames (every ${every} turns)`));
    for (const turn of stops) {
      const tag = turn === biggest.turn ? `  ← biggest hit (${biggest.dmg})` : turn === total ? '  ← final' : '';
      console.log(dim(`\n── turn ${turn}/${total}${tag} ${'─'.repeat(30)}`));
      console.log(renderFrame({ replay, turn, w: flags.width || 72, h: flags.height || 14 }).map(l => (flags.plain ? vis(l) : l)).join('\n'));
    }
    return;
  }

  if (cmd === 'story') {
    const [file] = flags._;
    if (!file) { console.error('duel story: need a replay file'); process.exitCode = 1; return; }
    const { renderStory } = await import('./render.js');
    console.log(renderStory(loadReplay(file)));
    return;
  }

  if (cmd === 'frame') {
    const [file, turnArg] = flags._;
    if (!file) { console.error('duel frame: need a replay file'); process.exitCode = 1; return; }
    const replay = loadReplay(file);
    const turn = turnArg != null ? Math.max(0, Math.min(replay.result.turns, Number(turnArg))) : replay.result.turns;
    const lines = renderFrame({ replay, turn, w: flags.width || 80, h: flags.height || 24 });
    console.log(lines.map(l => (flags.plain ? vis(l) : l)).join('\n'));
    return;
  }

  if (cmd === 'ladder') {
    const cmds = flags._;
    if (cmds.length < 2) { console.error('duel ladder: need at least two agents'); process.exitCode = 1; return; }
    const agents = cmds.map(c => ({ name: agentName(c), cmd: c }));
    // same-name agents would merge in the ratings map — disambiguate
    const seen = new Map();
    for (const a of agents) {
      const n = seen.get(a.name) ?? 0;
      seen.set(a.name, n + 1);
      if (n > 0) a.name = `${a.name}#${n + 1}`;
    }
    const seedBase = flags.seed ?? 1000;
    const timeout = flags.timeout ?? 1500;
    const game = flags.game || DEFAULT_GAME;
    let matchCount = 0;
    const { table, matches } = await runLadder(agents, async (A, B) => {
      const seed = seedBase + matchCount++;
      const { movesA, movesB } = await runMatch(A.cmd, B.cmd, { seed, timeout, game });
      const { result } = play(seed, movesA, movesB, game);
      return { winner: result.winner, turns: result.turns, seed };
    });
    writeFileSync('ladder.json', JSON.stringify({ updated: new Date().toISOString(), table, matches }, null, 2));
    console.log('rank agent               elo    w  l  d');
    table.forEach((r, i) => console.log(`${String(i + 1).padStart(4)} ${r.name.padEnd(20)} ${String(r.rating).padStart(6)}  ${String(r.w).padStart(2)} ${String(r.l).padStart(2)} ${String(r.d).padStart(2)}`));
    console.log('\n💾 ladder → ladder.json');
    return;
  }

  console.log(HELP);
  process.exitCode = 1;
}
