// rider-app/src/offline/chamaTbHistoryRepository.js
// ============================================================================
// MY PAYMENTS HISTORY (Table Banking): the phone's copy (offline-first)
// ============================================================================
//
// WHERE IT LIVES
//   In the existing chamaRecords store (collection "tb_history"), so it follows the SAME rules as the rest of the Chama history
//   (chamaRetentionPolicy.js): a six-month rolling window, a weekly cleanup that removes only rows the server already has, and removal
//   from the phone at logout (clearChamaData removes every row of the rider; clearTbHistoryKv forgets the cursors and totals).
//   The server keeps every payment for ever. The phone keeps the last six months; "Since Joining" is read from the server when online.
//
// TWO CATEGORIES (every row has a `kind`)
//   savings          a contribution into the group's savings
//   loan_repayment   a repayment of the member's loan
//
// THE PERIODS (what the four tiles mean). Dates are the day the Treasurer confirmed the payment (or the day it was sent, while waiting).
//   This Month    the current calendar month
//   Last Month    the previous calendar month
//   6 Months      the last six months (this and last month included): exactly the window the phone keeps
//   Since Joining everything: the totals come from the server (any age); offline, the last known totals
//
// A ROW
//   { id, rider_id, collection: 'tb_history', group_id, kind, ts (ms), date, syncStatus: 'synced', status,
//     payload: { id, kind, reference, amount, method, status, reason, submitted_at, at } }
//   A payment's row is replaced when its status changes (waiting -> confirmed / rejected), so the screen never shows a stale status.
// ============================================================================

import indexedDbAdapter from './adapters/indexedDbAdapter';
import { getLocalRiderId } from './db';
import { getRetentionCutoffDate } from './chamaRetentionPolicy';

const STORE = 'chamaRecords';
export const TB_HISTORY_COLLECTION = 'tb_history';
const CURSOR_PREFIX = 'chama_tbh_cursor_';
const META_PREFIX = 'chama_tbh_meta_';
const GROUPS_PREFIX = 'chama_tbh_groups_';

export const KINDS = ['savings', 'loan_repayment'];
export const KIND_LABEL = { savings: 'Savings', loan_repayment: 'Loan repayment' };

const parse = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return v;
};
async function rid(riderId) { return riderId || (await getLocalRiderId().catch(() => null)) || null; }
const rowId = (r, id) => `chama_tbh_${r}_${id}`;
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The start of the phone's window (six months back). What the server is asked for. */
export const windowStartMs = (now = new Date()) => getRetentionCutoffDate(now).getTime();
export const windowStartIso = (now = new Date()) => new Date(windowStartMs(now)).toISOString();

function toRow(r, groupId, item) {
  const ts = new Date(item.at).getTime();
  return {
    id: rowId(r, item.id), rider_id: r, collection: TB_HISTORY_COLLECTION, group_id: groupId, kind: item.kind,
    ts, timestamp: ts, date: isoDay(new Date(ts)), createdAt: item.submitted_at || item.at, syncStatus: 'synced',
    status: item.status, payload: item, cachedAt: Date.now(),
  };
}

// ───────────────────────────── the periods (pure: pass `now` to test) ─────────────────────────────
export function periodBounds(now = new Date()) {
  return {
    thisStart: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
    lastStart: new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(),
    windowStart: windowStartMs(now),
  };
}
/** Keep one category ('all' keeps both). */
export const byKind = (rows, kind) => (!kind || kind === 'all' ? rows.slice() : rows.filter((e) => e.kind === kind));

/**
 * Split CONFIRMED payments into the four tiles. The periods overlap on purpose, as their names say:
 * "6 Months" includes this and last month, and "Since Joining" includes everything.
 * `thisMonth` is [this month 1st, now]; `lastMonth` is [last month 1st, this month 1st): a payment is in exactly one of them.
 */
export function bucketPayments(confirmed, now = new Date()) {
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
/** This phone's payments for a group, newest first. All statuses, both categories. */
export async function loadTbPayments(groupId, riderId) {
  const r = await rid(riderId); if (!r) return [];
  const rows = (await indexedDbAdapter.queryRowsByIndex(STORE, 'collection', TB_HISTORY_COLLECTION) || [])
    .filter((x) => x.rider_id === r && x.group_id === groupId);
  rows.sort((a, b) => (b.ts - a.ts) || String(b.id).localeCompare(String(a.id)));
  return rows.map((x) => x.payload);
}

// ───────────────────────────── writing what the server sent ─────────────────────────────
/** Store payments from the server. Anything outside the six-month window is not kept. A changed payment replaces its row. */
export async function mirrorTbPayments(groupId, items, riderId) {
  const r = await rid(riderId); if (!r || !Array.isArray(items) || !items.length) return 0;
  const from = windowStartMs();
  const rows = items.filter((i) => new Date(i.at).getTime() >= from).map((i) => toRow(r, groupId, i));
  if (rows.length) await indexedDbAdapter.putRows(STORE, rows);
  return rows.length;
}

// ───────────────────────────── cursor, meta, and which groups to keep up to date ─────────────────────────────
// The cursor is text, so it is stored inside an object: reading it back must not try to parse the text itself as JSON.
export async function getCursor(groupId, riderId) { const r = await rid(riderId); return r ? parse(await indexedDbAdapter.kvGet(`${CURSOR_PREFIX}${r}_${groupId}`))?.cursor || null : null; }
export async function setCursor(groupId, cursor, riderId) { const r = await rid(riderId); if (r && cursor) await indexedDbAdapter.kvSet(`${CURSOR_PREFIX}${r}_${groupId}`, { cursor }); }
export async function getMeta(groupId, riderId) { const r = await rid(riderId); return r ? parse(await indexedDbAdapter.kvGet(`${META_PREFIX}${r}_${groupId}`)) || {} : {}; }
export async function setMeta(groupId, patch, riderId) {
  const r = await rid(riderId); if (!r) return {};
  const next = { ...(await getMeta(groupId, r)), ...patch };
  await indexedDbAdapter.kvSet(`${META_PREFIX}${r}_${groupId}`, next); return next;
}
/** Remember the "Since Joining" totals the server gave, so they can still be shown offline. */
export async function saveSummary(groupId, summary, riderId) {
  const r = await rid(riderId); if (!r) return;
  const one = (k) => ({ count: Number(summary?.[k]?.count) || 0, total: Number(summary?.[k]?.total) || 0 });
  await setMeta(groupId, { summary: { savings: one('savings'), loan_repayment: one('loan_repayment'), fetchedAt: Date.now() } }, r);
}
export async function getGroupsIndex(riderId) { const r = await rid(riderId); return r ? parse(await indexedDbAdapter.kvGet(`${GROUPS_PREFIX}${r}`)) || [] : []; }
export async function addGroupToIndex(groupId, riderId) {
  const r = await rid(riderId); if (!r) return [];
  const cur = await getGroupsIndex(r);
  if (cur.includes(groupId)) return cur;
  const next = [...cur, groupId]; await indexedDbAdapter.kvSet(`${GROUPS_PREFIX}${r}`, next); return next;
}

/** At logout: forget the cursors and totals (the rows themselves go with the rest of the rider's rows in clearChamaData). */
export async function clearTbHistoryKv(riderId) {
  const r = await rid(riderId); if (!r) return;
  for (const g of await getGroupsIndex(r)) {
    await indexedDbAdapter.kvDelete(`${CURSOR_PREFIX}${r}_${g}`).catch(() => {});
    await indexedDbAdapter.kvDelete(`${META_PREFIX}${r}_${g}`).catch(() => {});
  }
  await indexedDbAdapter.kvDelete(`${GROUPS_PREFIX}${r}`).catch(() => {});
}

export default {
  KINDS, KIND_LABEL, windowStartMs, windowStartIso, periodBounds, byKind, bucketPayments, sumAmounts, loadTbPayments, mirrorTbPayments,
  getCursor, setCursor, getMeta, setMeta, saveSummary, getGroupsIndex, addGroupToIndex, clearTbHistoryKv,
};
