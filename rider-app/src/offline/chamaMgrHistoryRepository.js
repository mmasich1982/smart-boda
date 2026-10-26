// rider-app/src/offline/chamaMgrHistoryRepository.js
// ============================================================================
// MY CONTRIBUTION HISTORY (Merry-Go-Round): the phone's copy (offline-first)
// ============================================================================
//
// WHERE IT LIVES
//   In the existing chamaRecords store (collection "mgr_contribution"), so it follows the SAME rules as the rest of the Chama history
//   (chamaRetentionPolicy.js): a six-month rolling window, a weekly cleanup that removes only rows the server already has, and removal
//   from the phone at logout (clearChamaData removes every row of the rider).
//   The server keeps every payment for ever. The phone keeps the last six months; "Since Joining" is read from the server when online.
//
// THE PERIODS (what the four tiles mean)
//   This Month    the current calendar month
//   Last Month    the previous calendar month
//   6 Months      the last six months (this month and last month included): exactly the window the phone keeps
//   Since Joining everything since the rider joined: the total comes from the server (works for any age); offline, the last known total
//
// A ROW
//   { id, rider_id, collection: 'mgr_contribution', group_id, circle_id, ts (ms), date, syncStatus: 'synced', status,
//     payload: { id, circle_id, circle_name, reference, amount, method, status, reason, self_confirmed, submitted_at, at } }
//   A payment's row is replaced when its status changes (waiting -> confirmed / rejected), so the screen never shows a stale status.
// ============================================================================

import indexedDbAdapter from './adapters/indexedDbAdapter';
import { getLocalRiderId } from './db';
import { getRetentionCutoffDate } from './chamaRetentionPolicy';

const STORE = 'chamaRecords';
const COLLECTION = 'mgr_contribution';
const CURSOR_PREFIX = 'chama_mgrc_cursor_';
const META_PREFIX = 'chama_mgrc_meta_';
const GROUPS_PREFIX = 'chama_mgrc_groups_';

const parse = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return v;
};
async function rid(riderId) { return riderId || (await getLocalRiderId().catch(() => null)) || null; }
const rowId = (r, id) => `chama_mgrc_${r}_${id}`;
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The start of the phone's window (six months back) as a timestamp. What the server is asked for. */
export const windowStartMs = (now = new Date()) => getRetentionCutoffDate(now).getTime();
export const windowStartIso = (now = new Date()) => new Date(windowStartMs(now)).toISOString();

function toRow(r, groupId, item) {
  const ts = new Date(item.at).getTime();
  return {
    id: rowId(r, item.id), rider_id: r, collection: COLLECTION, group_id: groupId, circle_id: item.circle_id,
    ts, timestamp: ts, date: isoDay(new Date(ts)), createdAt: item.submitted_at || item.at, syncStatus: 'synced',
    status: item.status, payload: item, cachedAt: Date.now(),
  };
}

// ───────────────────────────── the periods ─────────────────────────────
/** Where each period starts (timestamps). Pure: pass `now` to test. */
export function periodBounds(now = new Date()) {
  return {
    thisStart: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
    lastStart: new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(),
    windowStart: windowStartMs(now),
  };
}

/**
 * Split CONFIRMED payments into the four tiles. The periods overlap on purpose, as their names say:
 * "6 Months" includes this month and last month, and "Since Joining" includes everything.
 */
export function bucketContributions(confirmed, now = new Date()) {
  const { thisStart, lastStart, windowStart } = periodBounds(now);
  const t = (e) => new Date(e.at).getTime();
  return {
    thisMonth: confirmed.filter((e) => t(e) >= thisStart),
    lastMonth: confirmed.filter((e) => t(e) >= lastStart && t(e) < thisStart),
    sixMonths: confirmed.filter((e) => t(e) >= windowStart),
    sinceJoining: confirmed.slice(),
  };
}
export const sumAmounts = (rows) => rows.reduce((n, r) => n + Number(r.amount), 0);

// ───────────────────────────── reading ─────────────────────────────
/** This phone's payments for a group (optionally one circle), newest first. All statuses. */
export async function loadMgrContributions(groupId, circleId, riderId) {
  const r = await rid(riderId); if (!r) return [];
  const rows = (await indexedDbAdapter.queryRowsByIndex(STORE, 'collection', COLLECTION) || [])
    .filter((x) => x.rider_id === r && x.group_id === groupId && (!circleId || x.circle_id === circleId));
  rows.sort((a, b) => (b.ts - a.ts) || String(b.id).localeCompare(String(a.id)));
  return rows.map((x) => x.payload);
}

// ───────────────────────────── writing what the server sent ─────────────────────────────
/** Store payments from the server. Anything outside the six-month window is not kept. A changed payment replaces its row. */
export async function mirrorMgrContributions(groupId, items, riderId) {
  const r = await rid(riderId); if (!r || !Array.isArray(items) || !items.length) return 0;
  const from = windowStartMs();
  const rows = items.filter((i) => new Date(i.at).getTime() >= from).map((i) => toRow(r, groupId, i));
  if (rows.length) await indexedDbAdapter.putRows(STORE, rows);
  return rows.length;
}

// ───────────────────────────── cursor, meta, and which groups to keep up to date ─────────────────────────────
// The cursor is text ('time|id'), so it is stored inside an object: reading it back must not try to parse the text itself as JSON.
export async function getCursor(groupId, riderId) { const r = await rid(riderId); return r ? parse(await indexedDbAdapter.kvGet(`${CURSOR_PREFIX}${r}_${groupId}`))?.cursor || null : null; }
export async function setCursor(groupId, cursor, riderId) { const r = await rid(riderId); if (r && cursor) await indexedDbAdapter.kvSet(`${CURSOR_PREFIX}${r}_${groupId}`, { cursor }); }
export async function getMeta(groupId, riderId) { const r = await rid(riderId); return r ? parse(await indexedDbAdapter.kvGet(`${META_PREFIX}${r}_${groupId}`)) || {} : {}; }
export async function setMeta(groupId, patch, riderId) {
  const r = await rid(riderId); if (!r) return {};
  const next = { ...(await getMeta(groupId, r)), ...patch };
  await indexedDbAdapter.kvSet(`${META_PREFIX}${r}_${groupId}`, next); return next;
}
/** Remember the "Since Joining" total the server gave for a circle, so it can still be shown offline. */
export async function saveSummary(groupId, circleId, summary, riderId) {
  const r = await rid(riderId); if (!r) return;
  const meta = await getMeta(groupId, r);
  await setMeta(groupId, { summary: { ...(meta.summary || {}), [circleId || 'all']: { count: Number(summary.count) || 0, total: Number(summary.total) || 0, fetchedAt: Date.now() } } }, r);
}
export async function getGroupsIndex(riderId) { const r = await rid(riderId); return r ? parse(await indexedDbAdapter.kvGet(`${GROUPS_PREFIX}${r}`)) || [] : []; }
export async function addGroupToIndex(groupId, riderId) {
  const r = await rid(riderId); if (!r) return [];
  const cur = await getGroupsIndex(r);
  if (cur.includes(groupId)) return cur;
  const next = [...cur, groupId]; await indexedDbAdapter.kvSet(`${GROUPS_PREFIX}${r}`, next); return next;
}

/** At logout: forget the cursors and totals (the rows themselves go with the rest of the rider's rows in clearChamaData). */
export async function clearMgrHistoryKv(riderId) {
  const r = await rid(riderId); if (!r) return;
  for (const g of await getGroupsIndex(r)) {
    await indexedDbAdapter.kvDelete(`${CURSOR_PREFIX}${r}_${g}`).catch(() => {});
    await indexedDbAdapter.kvDelete(`${META_PREFIX}${r}_${g}`).catch(() => {});
  }
  await indexedDbAdapter.kvDelete(`${GROUPS_PREFIX}${r}`).catch(() => {});
}

export default {
  windowStartMs, windowStartIso, periodBounds, bucketContributions, sumAmounts, loadMgrContributions, mirrorMgrContributions,
  getCursor, setCursor, getMeta, setMeta, saveSummary, getGroupsIndex, addGroupToIndex, clearMgrHistoryKv,
};