#!/usr/bin/env node
// 🎯 counter — written to close issue #1: a bot that beats adapt.mjs.
// Three tells, all deterministic in adapt's policy:
//   1. adapt never heals until hp<=22 AND it is behind → its effective HP is
//      finite; win the damage race and heal only when it pays for itself.
//   2. adapt charges ~20% of neutral turns → its own ×1.25 opening is a tax
//      we collect by simply attacking while it sits charged.
//   3. adapt's charged → heavy is telegraphed → healing first absorbs the
//      burst (heals resolve before damage), and a heal KEEPS our charge.
// Invariant: never stay charged at low HP for free damage — cash it or heal.
let s = '';
process.stdin.on('data', d => (s += d));
process.stdin.on('end', () => {
  const { me, foe, turn, history, you } = JSON.parse(s);
  const foeSeq = history.map(h => h.moves[1 - you]);
  const foeHeavyRate = foeSeq.length ? foeSeq.filter(x => x === 'heavy').length / foeSeq.length : 0;
  const antiSpam = foeHeavyRate >= 0.3 && !foe.charged; // heavy-spammers never charge

  // kills first — adapt heals only at <=22 when behind, so above that it cannot
  // answer a lethal roll
  if (me.charged && foe.hp <= 27) return out('heavy');   // charged heavy min: floor(18*1.5)=27
  if (foe.hp <= 18) return out('heavy');                  // plain heavy min 18

  // absorb its telegraphed charged heavy when the trade is bad for us:
  // heals resolve before damage, and healing keeps our charge banked
  if (foe.charged && me.hp <= 45 && !me.charged) return out('heal');

  // anti-spam: never charge into a heavy-spammer (eating 22×1.25 is suicide).
  // Mirror the heavies — the trade wins on their recoil — and heal only in
  // emergency; the kill-window branches above close the race.
  if (antiSpam) {
    if (me.hp <= 18 && foe.hp > 26) return out('heal');
    return out('heavy');
  }

  // cash the charge — adapt answers a charged foe with a plain strike (E13.5),
  // while our charged heavy averages 33.3. Always worth the swing.
  if (me.charged) return out('heavy');

  // emergency heal below the thunder-dome line, but never while winning big
  if (me.hp <= 24 && me.hp <= foe.hp + 5) return out('heal');

  // adapt heals at <=22 when behind: punish the wasted turn by banking a charge
  if (foe.hp <= 24 && foe.hp < me.hp) return out('charge');

  // it camps chargers (strike when we charged twice+) and pressures healers —
  // vs its neutral mix (20% charge / 80% strike) trading strikes is -EV, so
  // charge on a budget and let the ×1.5 heavies do the talking
  if (me.hp >= 55 || turn <= 2) return out('charge');

  // mid-HP, unsure: strike keeps pressure without the ×1.25 opening tax
  return out(Math.random() < 0.25 ? 'strike' : 'charge');
});
const out = move => process.stdout.write(JSON.stringify({ move }));
