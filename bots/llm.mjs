#!/usr/bin/env node
// 🤖⚔️ an LLM fighter. Works with any OpenAI-compatible endpoint.
//   duel run bots/llm.mjs builtin:greedy --timeout 10000
// env: DUEL_API_KEY (or OPENAI_API_KEY) · DUEL_BASE_URL · DUEL_MODEL
// No key? It jabs (strike) — every bot must work offline.
let s = '';
process.stdin.on('data', d => (s += d));
process.stdin.on('end', async () => {
  const state = JSON.parse(s);
  const key = process.env.DUEL_API_KEY || process.env.OPENAI_API_KEY;
  const fallback = () => console.log(JSON.stringify({ move: 'strike' }));
  if (!key) return fallback();
  const base = (process.env.DUEL_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.DUEL_MODEL || 'gpt-4o-mini';
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a duel fighter. Reply with exactly one JSON object: {"move":"strike|heavy|heal|charge"}. Weigh HP levels, the charge multiplier (x1.8), and the 20% recoil chance on heavy.' },
          { role: 'user', content: JSON.stringify(state) },
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(Number(process.env.DUEL_TIMEOUT_MS) || 9000),
    });
    const j = await res.json();
    const m = (j.choices?.[0]?.message?.content || '').match(/"move"\s*:\s*"(strike|heavy|heal|charge)"/);
    console.log(JSON.stringify({ move: m ? m[1] : 'strike' }));
  } catch {
    fallback();
  }
});
