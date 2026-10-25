// Spectator playback: auto-advance with speed control, or step frame by frame.
// Same minimal-tty pattern as tape (~60 lines, no deps).
export async function watch(replay, renderFrame) {
  const out = process.stdout;
  const total = replay.result.turns;
  if (!out.isTTY || !process.stdin.isTTY) {
    console.log(renderFrame({ replay, turn: total }).join('\n'));
    return;
  }
  let turn = 0, paused = false, speed = 450, done = false, timer = null;

  process.stdin.setRawMode(true); process.stdin.resume();
  out.write('\x1b[?1049h\x1b[?25l\x1b[2J');

  const draw = () => out.write('\x1b[H' + renderFrame({ replay, turn }).map(l => '\x1b[K' + l).join('\n') + '\x1b[J');

  let resolve; const promise = new Promise(r => (resolve = r));
  const finish = () => {
    if (done) return; done = true;
    clearInterval(timer);
    out.write('\x1b[?25h\x1b[?1049l');
    process.stdin.setRawMode(false); process.stdin.pause();
    process.stdin.removeListener('data', onData);
    resolve();
  };
  const tick = () => { if (!paused && turn < total) { turn++; draw(); } };

  function startTimer() { clearInterval(timer); timer = setInterval(tick, speed); }

  function onData(buf) {
    for (let i = 0; i < buf.length; i++) {
      const k = buf[i];
      if (k === 27) { // arrow keys are 3-byte escapes; batched input needs scanning
        if (buf[i + 1] === 91 && buf[i + 2] === 68) { turn = Math.max(0, turn - 1); i += 2; }
        else if (buf[i + 1] === 91 && buf[i + 2] === 67) { turn = Math.min(total, turn + 1); i += 2; }
        continue;
      }
      if (k === 3 || k === 113) return finish();                     // ctrl-c / q
      if (k === 32) paused = !paused;                                 // space
      else if (k === 43 && speed > 100) { speed -= 100; startTimer(); }                   // +
      else if (k === 45 && speed < 1500) { speed += 100; startTimer(); }                  // -
    }
    draw();
  }

  process.stdin.on('data', onData);
  process.on('exit', () => { if (!done) out.write('\x1b[?25h\x1b[?1049l'); });
  draw();
  startTimer();
  return promise;
}
