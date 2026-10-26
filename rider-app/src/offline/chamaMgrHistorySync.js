// rider-app/src/offline/chamaMgrHistorySync.js
// ============================================================================
// MY CONTRIBUTION HISTORY (Merry-Go-Round): keeping the phone and the server in step
// ============================================================================
//
// READING IS LOCAL: the screen reads the phone and shows at once, with or without a connection (chamaMgrHistoryRepository).
// This file only moves data, and as little as it can:
//
//   PULL  GET /chama/mgr/me/contributions?since=<cursor>&from_ts=<six months ago>
//         • the cursor means a phone that is up to date gets an empty answer
//         • from_ts keeps the server from sending what the phone's window would throw away
//         • a payment whose status changed (waiting -> confirmed or rejected) comes down again and replaces its row
//         • catch-ups arrive 100 at a time and the cursor is saved after each page
//   There is nothing to upload: a payment is made on the Pay screen, which needs a connection; the history is read-only. So there is no
//   sync-queue entry for it, and nothing here can send money.
//
//   WHEN  (1) when the screen opens (after it has shown the phone's copy), (2) after each normal sync cycle (runChamaSyncCycle),
//         at most every 15 minutes per group. Never on a timer of its own, never while offline.
//         A sync that ran in the last 5 minutes is skipped.
//
//   SINCE JOINING: the total for any age comes from GET /me/contributions/summary and is remembered for offline.
//         The list of payments older than the phone keeps is read online, page by page (fetchMgrHistoryPage).
// ============================================================================

import { getLocalRiderId } from './db';
import { isOnlineNow, isNetworkFailure } from './chamaConnectivity';
import {
  windowStartIso, mirrorMgrContributions, getCursor, setCursor, getMeta, setMeta, saveSummary, getGroupsIndex, addGroupToIndex,
} from './chamaMgrHistoryRepository';
import { mgrContributionsPage, mgrContributionsSummary } from '../api/groupsClient';

export const MGR_HISTORY_SYNC_CONFIG = { RECENT_MS: 5 * 60 * 1000, CYCLE_MS: 15 * 60 * 1000, PAGE_SIZE: 100, MAX_PAGES: 50 };

const inflight = new Map();
const status = (e) => e?.response?.status;

async function pull(rid, groupId) {
  let cursor = await getCursor(groupId, rid), pulled = 0;
  const from = windowStartIso();
  for (let page = 0; page < MGR_HISTORY_SYNC_CONFIG.MAX_PAGES; page++) {
    const res = await mgrContributionsPage(groupId, { since: cursor || undefined, from_ts: from, order: 'asc', limit: MGR_HISTORY_SYNC_CONFIG.PAGE_SIZE });
    if (res.items?.length) pulled += await mirrorMgrContributions(groupId, res.items, rid);
    if (res.next_cursor && res.next_cursor !== cursor) { cursor = res.next_cursor; await setCursor(groupId, cursor, rid); }   // saved after every page
    if (!res.has_more) break;
  }
  await setMeta(groupId, { lastSyncAt: Date.now() }, rid);
  return pulled;
}

/**
 * Bring one group's payment history up to date. Safe to call often.
 * @returns {Promise<{ok?:true, pulled?:number, offline?:true, skipped?:string}>}
 */
export function syncMgrHistory(groupId, opts = {}) {
  if (!groupId) return Promise.resolve({ skipped: 'no_group' });
  if (inflight.has(groupId)) return inflight.get(groupId);
  const job = (async () => {
    try {
      const rid = await getLocalRiderId();
      if (!rid) return { skipped: 'no_rider' };
      if (!(await isOnlineNow())) return { offline: true };
      const meta = await getMeta(groupId, rid);
      const gap = opts.minGapMs ?? MGR_HISTORY_SYNC_CONFIG.RECENT_MS;
      if (!opts.force && meta.lastSyncAt && Date.now() - meta.lastSyncAt < gap) return { skipped: 'recent' };
      await addGroupToIndex(groupId, rid);
      return { ok: true, pulled: await pull(rid, groupId) };
    } catch (err) {
      if (isNetworkFailure(err)) return { offline: true };
      if (status(err) === 403 || status(err) === 404) return { skipped: 'not_a_member' };
      console.warn('⚠️ [mgrHistorySync] failed (non-fatal):', err?.message);
      return { error: err?.message };
    } finally { inflight.delete(groupId); }
  })();
  inflight.set(groupId, job);
  return job;
}

/** The background cycle: every group this rider has opened the history for, gently. */
export async function syncAllMgrHistory() {
  try {
    const rid = await getLocalRiderId();
    if (!rid) return { skipped: 'no_rider' };
    const out = {};
    for (const g of await getGroupsIndex(rid)) out[g] = await syncMgrHistory(g, { minGapMs: MGR_HISTORY_SYNC_CONFIG.CYCLE_MS });
    return out;
  } catch (err) { return { error: err?.message }; }
}

/** Tell the app this group's history should be kept up to date in the background. */
export const registerMgrHistoryGroup = (groupId) => addGroupToIndex(groupId);

/** The "Since Joining" total from the server, remembered for offline. Returns the last known one when offline. */
export async function refreshSummary(groupId, circleId) {
  try {
    if (!(await isOnlineNow())) return null;
    const s = await mgrContributionsSummary(groupId, circleId);
    await saveSummary(groupId, circleId, s);
    return s;
  } catch (err) { if (!isNetworkFailure(err)) console.warn('⚠️ [mgrHistorySync] summary failed (non-fatal):', err?.message); return null; }
}

export class HistoryOfflineError extends Error {
  constructor() { super('Older payments need an internet connection.'); this.code = 'HISTORY_OFFLINE'; this.isOffline = true; }
}
/** One page of the WHOLE confirmed history (any age), newest first, for "Since Joining". Not stored on the phone. */
export async function fetchMgrHistoryPage(groupId, circleId, { offset = 0, limit = 5 } = {}) {
  if (!(await isOnlineNow())) throw new HistoryOfflineError();
  try { return await mgrContributionsPage(groupId, { circle_id: circleId || undefined, order: 'desc', status: 'confirmed', offset, limit }); }
  catch (err) { if (isNetworkFailure(err)) throw new HistoryOfflineError(); throw err; }
}

export default { syncMgrHistory, syncAllMgrHistory, registerMgrHistoryGroup, refreshSummary, fetchMgrHistoryPage, HistoryOfflineError, MGR_HISTORY_SYNC_CONFIG };