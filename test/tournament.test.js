import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedBracket, runTournament, renderBracket } from '../src/tournament.js';
import { askAgent } from '../src/agent.js';
import { play, agentView, DEFAULT_GAME } from '../src/engine.js';

const N = n => Array.from({ length: n }, (_, i) => ({ name: `bot${i + 1}`, cmd: 'builtin:random' }));

test('seedBracket: deterministic shuffle, power-of-two padding, no bye pairs', () => {
  for (const n of [2, 3, 5, 6, 7, 9]) {
    const { slots, size } = seedBracket(N(n), 42);
    assert.equal(size, 1 << Math.ceil(Math.log2(n)));
    const names = slots.filter(Boolean).map(s => s.name);
    assert.equal(new Set(names).size, n); // everyone present exactly once
    for (let i = 0; i < slots.length; i += 2) {
      assert.ok(slots[i] !== null || slots[i + 1] !== null, `pair ${i} has two byes`);
    }
    const again = seedBracket(N(n), 42);
    assert.deepEqual(again.slots.map(s => s?.name), slots.map(s => s?.name));
  }
});

test('different seeds shuffle differently (probabilistic but stable)', () => {
  const a = seedBracket(N(8), 1).slots.map(s => s.name).join(',');
  const b = seedBracket(N(8), 2).slots.map(s => s.name).join(',');
  assert.notEqual(a, b);
});

test('tournament: builtin bracket crowns a champion and records re-simulable moves', async () => {
  const agents = N(4).map((a, i) => ({ ...a, cmd: i % 2 ? 'builtin:random' : 'builtin:greedy' }));
  const t = await runTournament(agents, async (A, B, matchIndex) => {
    const seed = 900 + matchIndex;
    const { movesA, movesB } = await Promise.all([0, 1]).then(async () => {
      // drive builtins turn by turn
      const mA = [], mB = [];
      for (let turn = 1; turn <= 40; turn++) {
        const sim = play(seed, mA, mB, DEFAULT_GAME);
        if (sim.result.stop !== 'moves') break;
        const last = sim.log[sim.log.length - 1] ?? { hp: [100, 100], charged: [false, false] };
        const [ra, rb] = await Promise.all([
          askAgent(A.cmd, agentView(sim.log, 0, turn, DEFAULT_GAME)),
          askAgent(B.cmd, agentView(sim.log, 1, turn, DEFAULT_GAME)),
        ]);
        mA.push(ra.move); mB.push(rb.move);
        void last;
      }
      return [mA, mB];
    });
    const { result } = play(seed, movesA, movesB, DEFAULT_GAME);
    return { winnerName: result.winner === 'a' ? A.name : result.winner === 'b' ? B.name : A.name, seed, moves: { a: movesA, b: movesB } };
  }, 900);
  assert.ok(t.champion);
  assert.equal(t.rounds.length, 2); // 4 agents → 2 rounds
  assert.ok(t.rounds[1].matches[0].a.length > 0);
  const text = renderBracket(t);
  assert.match(text, /champion: /);
  assert.match(text, /final/);
});
