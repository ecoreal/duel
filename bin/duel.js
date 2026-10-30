#!/usr/bin/env node
import { main } from '../src/cli.js';

// A missing replay or a typo'd agent is a fact about your command line, not a
// reason to print a stack trace. Anything the engine can't simulate is already
// handled inside; this is the last net.
const where = e => (e?.path ? `: ${e.path}` : '');
const clean = e => {
  if (e?.code === 'ENOENT') return `no such file${where(e)}`;
  if (e?.code === 'EISDIR') return `that is a directory${where(e)}`;
  if (e?.code === 'EACCES') return `permission denied${where(e)}`;
  return e?.message || String(e);
};

Promise.resolve(main(process.argv.slice(2))).catch(e => {
  console.error(`duel: ${clean(e)}`);
  process.exitCode = 1;
});
