// rider-app/src/offline/retentionScheduler.js
// ============================================================================
// SIX-MONTH RETENTION: live data cleanup + weekly schedule
// ============================================================================
//
// WHY THIS FILE EXISTS
// The app's live records are written as key-value entries (trip_entry_*, fuel_entry_*, battery_entry_*,
// maintenance_entry_*, other_expense_*) with per-rider history caches (trip_history_*, fuel_history_* ...) and one
// daily summary per date. The older cleanup routines (cleanupOldTrips, db.cleanupOldData,
// performRetentionCycleCleanup) look at IndexedDB stores that these screens do not write to, and nothing called
// them, so no six-month cleanup was actually running. This module applies the six-month policy to the data riders
// really have, and runs everything on a weekly schedule from the SyncOrchestrator.
//
// POLICY (same as TripRetentionPolicy / FinancialHistoryRepository / Chama)
//   • ROLLING window: today minus 6 calendar months.
//   • Only the phone's copy is removed. Everything is archived in PostgreSQL once synced.
//   • NEVER removed, however old:
//       - a record still waiting in the sync queue, or marked pending / syncing / failed
//       - Lipa Later records and Lipa Later trips (money still owed to the rider; db.cleanupOldData keeps its own
//         1-year rule for the lipaLater store)
//       - anything we cannot date or cannot read
//   • If the sync queue cannot be read, NOTHING is deleted that run (we never delete blind).
//   • Statements, subscription and payment records are not touched here (they have their own policies).
//
// SCHEDULE
//   Runs at most once a week. The SyncOrchestrator calls runScheduledRetention() after each sync check; it returns
//   immediately when the next run is not due.
// ============================================================================

import indexedDbAdapter from './adapters/indexedDbAdapter';
import { loadSyncQueue } from './syncQueue';
import { getLocalRiderId, cleanupOldData } from './db';
import { cleanupOldTrips } from './tripsRepository';
import { performRetentionCycleCleanup } from './financialHistoryRepository';

export const RETENTION_MONTHS = 6;
export const RETENTION_SCHEDULE_KEY = 'retention_schedule_v1';
export const RETENTION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;   // weekly

// One record per key. The part after the prefix is the record id the sync queue uses.
export const ENTRY_PREFIXES = ['trip_entry_', 'fuel_entry_', 'battery_entry_', 'maintenance_entry_', 'other_expense_'];
// Per-rider history caches (arrays, or objects holding arrays). Old items are pruned out of them.
export const CACHE_PREFIXES = ['trip_history_', 'fuel_history_', 'battery_history_', 'maintenance_history_', 'financial_history_'];
// One summary per day, key ends in YYYY-MM-DD.
export const DAILY_SUMMARY_PREFIX = 'daily_trade_summary_';

const PROTECTED_STATUS = ['pending', 'syncing', 'failed'];

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
export function getCutoffMs(now = Date.now()) {
  const d = new Date(now);
  d.setMonth(d.getMonth() - RETENTION_MONTHS);
  return d.getTime();
}

const parseValue = (v) => {
  if (v === null || v === undefined) return { ok: false };
  if (typeof v === 'string') {
    try { return { ok: true, value: JSON.parse(v), wasString: true }; } catch { return { ok: false }; }
  }
  return { ok: true, value: v, wasString: false };
};

/** Date of a record in ms, or null when it has none we can read. */
export function itemTimestamp(item) {
  if (!item || typeof item !== 'object') return null;
  for (const c of [item.ts, item.timestamp, item.createdAt, item.created_at, item.date]) {
    if (c === undefined || c === null || c === '') continue;
    const ms = typeof c === 'number' ? c : new Date(c).getTime();
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return null;
}

/** Lipa Later (customer credit) is never removed by this cleanup. */
export function isLipaLater(item) {
  const m = String((item && (item.method || item.paymentMethod || item.payment_method)) || '').toLowerCase();
  return m.includes('lipa');
}

const isProtectedStatus = (item) => !!item && PROTECTED_STATUS.includes(item.syncStatus || item.sync_status);

/** Every id still waiting to reach the server. Throws when the queue cannot be read. */
export async function readUnsyncedIds() {
  const queue = await loadSyncQueue();
  const ids = new Set();
  (queue || []).forEach((q) => {
    if (!q || q.status === 'synced') return;
    if (q.id) ids.add(String(q.id));
    if (q.data && q.data.id) ids.add(String(q.data.id));
  });
  return ids;
}

/**
 * Remove old items from a cache value (array, or object whose top-level lists hold records).
 * Items with no readable date, Lipa Later items and protected-status items are kept.
 */
export function pruneContainer(value, cutoffMs, unsyncedIds = new Set()) {
  const keep = (item) => {
    if (!item || typeof item !== 'object') return true;
    const ts = itemTimestamp(item);
    if (ts === null || ts >= cutoffMs) return true;
    if (isLipaLater(item) || isProtectedStatus(item)) return true;
    if (item.id && unsyncedIds.has(String(item.id))) return true;
    return false;
  };
  let removed = 0;
  const filterList = (list) => {
    const out = list.filter(keep);
    removed += list.length - out.length;
    return out;
  };
  if (Array.isArray(value)) return { value: filterList(value), removed };
  if (value && typeof value === 'object') {
    const next = { ...value };
    Object.keys(next).forEach((k) => {
      if (Array.isArray(next[k]) && next[k].length && typeof next[k][0] === 'object') next[k] = filterList(next[k]);
    });
    return { value: next, removed };
  }
  return { value, removed: 0 };
}

// ---------------------------------------------------------------------------
// the cleanup of live key-value data
// ---------------------------------------------------------------------------
/**
 * @param {{now?:number, unsyncedIds:Set<string>}} opts
 * @returns {Promise<{entriesDeleted:number, cachesPruned:number, cacheItemsRemoved:number, summariesDeleted:number, cutoff:string}>}
 */
export async function runLiveDataRetention({ now = Date.now(), unsyncedIds } = {}) {
  if (!(unsyncedIds instanceof Set)) throw new Error('unsyncedIds is required: refusing to delete without knowing what is unsynced');
  const cutoffMs = getCutoffMs(now);
  const cutoffDay = new Date(cutoffMs).toISOString().slice(0, 10);
  const result = { entriesDeleted: 0, cachesPruned: 0, cacheItemsRemoved: 0, summariesDeleted: 0, cutoff: new Date(cutoffMs).toISOString() };

  const allPrefixes = [...ENTRY_PREFIXES, ...CACHE_PREFIXES, DAILY_SUMMARY_PREFIX];
  const rows = await indexedDbAdapter.queryRows('keyValue', (r) => typeof r.key === 'string' && allPrefixes.some((p) => r.key.startsWith(p)));

  for (const row of rows) {
    const key = row.key;
    try {
      // --- daily summaries: the date is in the key ---
      if (key.startsWith(DAILY_SUMMARY_PREFIX)) {
        const day = key.slice(DAILY_SUMMARY_PREFIX.length, DAILY_SUMMARY_PREFIX.length + 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day < cutoffDay) {
          await indexedDbAdapter.kvDelete(key);
          result.summariesDeleted += 1;
        }
        continue;
      }

      const parsed = parseValue(row.value);
      if (!parsed.ok) continue;                                   // unreadable: keep

      // --- one record per key ---
      const entryPrefix = ENTRY_PREFIXES.find((p) => key.startsWith(p));
      if (entryPrefix) {
        const rec = parsed.value;
        const ts = itemTimestamp(rec);
        if (ts === null || ts >= cutoffMs) continue;              // undated or inside the window: keep
        if (isLipaLater(rec) || isProtectedStatus(rec)) continue; // money owed / not synced: keep
        const id = key.slice(entryPrefix.length);
        if (unsyncedIds.has(id) || (rec && rec.id && unsyncedIds.has(String(rec.id)))) continue; // still in the queue: keep
        await indexedDbAdapter.kvDelete(key);
        result.entriesDeleted += 1;
        continue;
      }

      // --- history caches: prune old items, keep the rest, write back in the same form ---
      if (CACHE_PREFIXES.some((p) => key.startsWith(p))) {
        const { value, removed } = pruneContainer(parsed.value, cutoffMs, unsyncedIds);
        if (removed > 0) {
          await indexedDbAdapter.kvSet(key, parsed.wasString ? JSON.stringify(value) : value);
          result.cachesPruned += 1;
          result.cacheItemsRemoved += removed;
        }
      }
    } catch (err) {
      console.warn('⚠️ [retention] skipped', key, err && err.message);   // one bad row must never stop the run
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// the weekly schedule
// ---------------------------------------------------------------------------
let running = false;

async function readSchedule() {
  const parsed = parseValue(await indexedDbAdapter.kvGet(RETENTION_SCHEDULE_KEY));
  return parsed.ok ? parsed.value : null;
}

export async function getRetentionScheduleStatus() {
  const s = await readSchedule();
  return {
    lastRunAt: (s && s.lastRunAt) || null,
    nextRunAt: (s && s.nextRunAt) || null,
    lastResult: (s && s.lastResult) || null,
    cutoff: new Date(getCutoffMs()).toISOString(),
  };
}

/**
 * Run the whole six-month cleanup if it is due (weekly). Never throws.
 *
 *   1. live key-value data   : entries, history caches, daily summaries
 *   2. IndexedDB trips store  : cleanupOldTrips
 *   3. IndexedDB legacy stores: db.cleanupOldData (trips, fuel, battery, statements: 6 months; Lipa Later: 1 year)
 *   4. financial history      : performRetentionCycleCleanup
 * (Chama data has its own weekly cleanup in chamaRepository.js.)
 *
 * @param {{force?:boolean, now?:number}} [opts]
 */
export async function runScheduledRetention({ force = false, now = Date.now() } = {}) {
  if (running) return { skipped: true, reason: 'already_running' };
  running = true;
  try {
    const schedule = await readSchedule();
    if (!force && schedule && schedule.nextRunAt && now < schedule.nextRunAt) {
      return { skipped: true, reason: 'not_due', nextRunAt: schedule.nextRunAt };
    }

    const riderId = await getLocalRiderId();
    if (!riderId) return { skipped: true, reason: 'no_rider' };

    let unsyncedIds;
    try {
      unsyncedIds = await readUnsyncedIds();
    } catch (err) {
      console.warn('⚠️ [retention] sync queue unreadable, nothing deleted this run:', err && err.message);
      return { skipped: true, reason: 'queue_unreadable' };
    }

    const result = { ranAt: now };
    const step = async (name, fn) => {
      try { result[name] = await fn(); } catch (err) { result[name] = { error: (err && err.message) || String(err) }; }
    };

    await step('live', () => runLiveDataRetention({ now, unsyncedIds }));
    await step('trips', () => cleanupOldTrips(riderId, { unsyncedIds }));
    await step('legacyStores', () => cleanupOldData());
    await step('financial', () => performRetentionCycleCleanup(riderId));

    await indexedDbAdapter.kvSet(RETENTION_SCHEDULE_KEY, {
      lastRunAt: now,
      nextRunAt: now + RETENTION_INTERVAL_MS,
      lastResult: result,
    });
    console.log('🧹 [retention] six-month cleanup finished', JSON.stringify(result.live || {}));
    return { skipped: false, ...result };
  } catch (err) {
    console.error('❌ [retention] scheduled cleanup error:', err);
    return { skipped: true, reason: 'error', error: err && err.message };
  } finally {
    running = false;
  }
}

export default {
  RETENTION_MONTHS,
  RETENTION_INTERVAL_MS,
  ENTRY_PREFIXES,
  CACHE_PREFIXES,
  getCutoffMs,
  itemTimestamp,
  isLipaLater,
  readUnsyncedIds,
  pruneContainer,
  runLiveDataRetention,
  runScheduledRetention,
  getRetentionScheduleStatus,
};
