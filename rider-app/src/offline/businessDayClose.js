// rider-app/src/offline/businessDayClose.js
// WHEN THE END-OF-DAY CLOSE RUNS. The close itself is businessStore.closeDays(); this file only decides when to call it, for EVERY business on the phone:
//   * when the app opens and at every sync cycle (even offline), so a phone that was off at midnight, or offline for days, still closes every missed day;
//   * at midnight East Africa Time while the app is open.
// A summary closed offline is queued and sent as soon as the phone is online, however many days later.
import * as R from './businessReportUtils';

const DAY = 86400000;

/** Milliseconds from `nowMs` to the next 00:00 EAT. */
export const msUntilEatMidnight = (nowMs = Date.now()) => { const next = Math.floor((nowMs + R.EAT_MS) / DAY) * DAY + DAY - R.EAT_MS; return next - nowMs; };

/** Close the past days of every business this phone holds. Never throws: one business failing does not stop the others. */
export async function closeAllBusinessDays(repo, nowMs = Date.now()) {
  const out = {};
  let mine = [];
  try { mine = await repo.registry.getMine(); } catch (e) { return out; }
  for (const b of mine) {
    try { out[b.business_id] = await (await repo.scoped(b.business_id)).closeDays({ nowMs }); } catch (e) { out[b.business_id] = { error: (e && e.message) || String(e) }; }
  }
  return out;
}

/** Calls `run` five seconds after each EAT midnight while the app is open. Returns stop(). */
export function startMidnightCloser(run, { now = () => Date.now(), setT = setTimeout, clearT = clearTimeout } = {}) {
  let timer = null; let stopped = false;
  const arm = () => { timer = setT(async () => { if (stopped) return; try { await run(); } finally { if (!stopped) arm(); } }, msUntilEatMidnight(now()) + 5000); };
  arm();
  return () => { stopped = true; if (timer) clearT(timer); };
}
