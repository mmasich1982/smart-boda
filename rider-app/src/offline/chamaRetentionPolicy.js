// rider-app/src/offline/chamaRetentionPolicy.js
// ✅ RETENTION POLICY: Six-month rolling window for Chama / My Savings / My Loans data kept ON THE PHONE
// Same policy as tripRetentionPolicy.js and financialHistoryRepository.js, applied to Chama records.
// All data stays safely archived in PostgreSQL; only the device copy is trimmed.

/**
 * ============================================================================
 * CHAMA DATA RETENTION POLICY
 * ============================================================================
 *
 * STORAGE ARCHITECTURE:
 * └─ IndexedDB (device, 6-month rolling window)
 *    ├─ chamaRecords (store)           : one row per history item
 *    │    collections: contribution | loan_payment |
 *    │                 group_ledger | notification | mgr_contribution
 *    ├─ chama_snapshot_${riderId}_${key}: last good server answer for a screen (summary, board, state …)
 *    ├─ chama_membership_${riderId}     : has_group / group_type / roles (drives the Home tiles)
 *    └─ chama_retention_config_${riderId}: lastCleanupAt, nextCleanupAt, lastCleanupResult
 *
 * └─ PostgreSQL (server, long-term archive)
 *    └─ every contribution, loan, repayment, ledger entry and statement ever recorded. No retention limit.
 *
 * RETENTION WINDOW
 * ────────────────
 * • 6 months, ROLLING (today minus 6 calendar months). A record's age is measured from the date it happened
 *   (submitted / posted / created), never from when it was cached.
 * • Applies to the Rider, Treasurer and Group Official views, because all three use this app.
 * • Cleanup runs at most weekly, triggered by the SyncOrchestrator after a successful sync cycle (and on
 *   app start through the same orchestrator).
 *
 * SAFETY RULES (same spirit as the trip policy)
 * ─────────────────────────────────────────────
 * • Only records the SERVER already has (syncStatus === 'synced') can be deleted.
 * • Anything 'pending' / 'failed' (waiting in the SyncQueue) is NEVER deleted, however old.
 * • Cleanup is skipped while offline: we do not trim data the person may still be looking at.
 * • The newest MIN_DAYS_TO_PRESERVE days are always kept, even if the clock jumps.
 * • Snapshots (summary screens) are overwritten on every refresh, so they never age out of the window.
 *
 * AFTER 6 MONTHS
 * ──────────────
 * • The record is removed from the phone only. Statements, history and exports older than 6 months are
 *   available from the Smart Boda Administrator on request (the same message the Financial History uses).
 *
 * ============================================================================
 */

export const CHAMA_RETENTION_CONFIG = {
  // Retention window, in calendar months (matches DATA_RETENTION_MONTHS in tripsRepository.js)
  RETENTION_MONTHS: 6,

  // Cleanup schedule: weekly
  CLEANUP_INTERVAL_MS: 7 * 24 * 60 * 60 * 1000,

  // Never delete anything newer than this, even if the window maths says otherwise (clock changes)
  MIN_DAYS_TO_PRESERVE: 30,

  // Rough size of a cached history row (for the storage summary only)
  ESTIMATED_BYTES_PER_RECORD: 400,

  // The wording shown to people when a range reaches past the window
  ADMIN_NOTICE:
    'Smart Boda keeps your last 6 months of Chama records on your phone. For older statements, contact the Smart Boda Administrator.',
};

export const CHAMA_COLLECTIONS = [
  'contribution',
  'loan_payment',
  'group_ledger',
  'notification',
  'mgr_contribution',   // My Contribution History (Merry-Go-Round): same six-month window; "Since Joining" is read from the server
];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Calculate the retention cutoff: records OLDER than this can be removed from the phone.
 * Rolling window = now minus 6 calendar months.
 *
 * @param {Date|number|string} [now] - reference time (defaults to now; injectable for tests)
 * @returns {Date}
 */
export function getRetentionCutoffDate(now = new Date()) {
  try {
    const cutoff = new Date(now);
    if (Number.isNaN(cutoff.getTime())) throw new Error('invalid reference date');
    cutoff.setMonth(cutoff.getMonth() - CHAMA_RETENTION_CONFIG.RETENTION_MONTHS);
    return cutoff;
  } catch (err) {
    console.error('❌ [chamaRetention] Error calculating cutoff:', err);
    const fallback = new Date();
    fallback.setMonth(fallback.getMonth() - CHAMA_RETENTION_CONFIG.RETENTION_MONTHS);
    return fallback;
  }
}

/**
 * Read the moment a Chama record happened, in milliseconds. Tries every field the server and the app use.
 * Returns null when the record has no usable date (such a record is KEPT, never deleted).
 */
export function getRecordTimestamp(record) {
  if (!record) return null;
  const candidates = [record.ts, record.timestamp, record.submitted_at, record.at, record.posted_at, record.created_at, record.createdAt, record.date];
  for (const c of candidates) {
    if (c === undefined || c === null || c === '') continue;
    const ms = typeof c === 'number' ? c : new Date(c).getTime();
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return null;
}

/**
 * Is a record inside the retention window?
 * A record with no readable date is treated as retained (we never delete what we cannot date).
 */
export function isWithinRetentionWindow(recordTimestamp, cutoffDate = getRetentionCutoffDate()) {
  try {
    if (recordTimestamp === null || recordTimestamp === undefined) return true;
    const ms = typeof recordTimestamp === 'number' ? recordTimestamp : new Date(recordTimestamp).getTime();
    if (!Number.isFinite(ms)) return true;
    return ms >= new Date(cutoffDate).getTime();
  } catch (err) {
    console.error('❌ [chamaRetention] Error checking retention window:', err);
    return true; // keep the record if we cannot tell
  }
}

/**
 * Days left before a record ages out of the window (negative if it already has).
 */
export function getDaysUntilDeletion(recordTimestamp, now = new Date()) {
  try {
    if (recordTimestamp === null || recordTimestamp === undefined) return 999;
    const expires = new Date(recordTimestamp);
    expires.setMonth(expires.getMonth() + CHAMA_RETENTION_CONFIG.RETENTION_MONTHS);
    return Math.floor((expires.getTime() - new Date(now).getTime()) / DAY_MS);
  } catch (err) {
    console.error('❌ [chamaRetention] Error calculating days until deletion:', err);
    return 999;
  }
}

/**
 * Retention status for one record.
 * @returns {{status:'retained'|'expired'|'unknown', daysRemaining:number, isSynced:boolean, canDelete:boolean, recordId:string}}
 */
export function getChamaRecordRetentionStatus(record, cutoffDate = getRetentionCutoffDate(), now = new Date()) {
  try {
    const ts = getRecordTimestamp(record);
    if (ts === null) {
      return { status: 'unknown', daysRemaining: 999, isSynced: record?.syncStatus === 'synced', canDelete: false, recordId: record?.id };
    }
    const retained = isWithinRetentionWindow(ts, cutoffDate);
    const isSynced = record.syncStatus === 'synced';
    // Always keep the newest MIN_DAYS_TO_PRESERVE days, whatever the cutoff says
    const tooRecent = new Date(now).getTime() - ts < CHAMA_RETENTION_CONFIG.MIN_DAYS_TO_PRESERVE * DAY_MS;
    return {
      status: retained ? 'retained' : 'expired',
      daysRemaining: getDaysUntilDeletion(ts, now),
      isSynced,
      canDelete: !retained && isSynced && !tooRecent,
      recordId: record.id,
    };
  } catch (err) {
    console.error('❌ [chamaRetention] Error getting retention status:', err);
    return { status: 'unknown', daysRemaining: 999, isSynced: false, canDelete: false, recordId: record?.id };
  }
}

/**
 * Records that may be removed from the phone: expired AND already on the server.
 */
export function getRecordsEligibleForDeletion(records, cutoffDate = getRetentionCutoffDate(), now = new Date()) {
  try {
    return (records || []).filter((r) => getChamaRecordRetentionStatus(r, cutoffDate, now).canDelete);
  } catch (err) {
    console.error('❌ [chamaRetention] Error finding deletable records:', err);
    return [];
  }
}

/**
 * Keep only the records inside the window (used on lists before they are shown or cached).
 * Records with no readable date are kept.
 */
export function filterToRetentionWindow(records, cutoffDate = getRetentionCutoffDate()) {
  return (records || []).filter((r) => isWithinRetentionWindow(getRecordTimestamp(r), cutoffDate));
}

/**
 * Pull a requested date range back inside the window. Used by Group Finance History so "Since Joining"
 * and "Last 6 Months" never ask for more than the phone is meant to hold.
 *
 * @param {string} fromIso  YYYY-MM-DD
 * @param {string} toIso    YYYY-MM-DD
 * @returns {{from:string, to:string, clamped:boolean}}
 */
export function clampDateRangeToRetention(fromIso, toIso, now = new Date()) {
  const toIsoDay = (d) => d.toISOString().slice(0, 10);
  const cutoff = getRetentionCutoffDate(now);
  const cutoffDay = toIsoDay(new Date(Date.UTC(cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate(), 12)));
  if (!fromIso) return { from: cutoffDay, to: toIso, clamped: true };
  if (fromIso < cutoffDay) return { from: cutoffDay, to: toIso, clamped: true };
  return { from: fromIso, to: toIso, clamped: false };
}

/**
 * Storage summary (for diagnostics, same shape as getStorageUsageSummary in tripRetentionPolicy.js).
 */
export function getStorageUsageSummary(records, cutoffDate = getRetentionCutoffDate(), now = new Date()) {
  try {
    const list = records || [];
    const retained = list.filter((r) => isWithinRetentionWindow(getRecordTimestamp(r), cutoffDate)).length;
    const expired = list.length - retained;
    const synced = list.filter((r) => r.syncStatus === 'synced').length;
    const pending = list.length - synced;
    const deletable = getRecordsEligibleForDeletion(list, cutoffDate, now).length;
    const per = CHAMA_RETENTION_CONFIG.ESTIMATED_BYTES_PER_RECORD;
    return {
      totalRecords: list.length,
      retained,
      expired,
      synced,
      pending,
      canDelete: deletable,
      estimatedRetainedBytes: retained * per,
      estimatedExpiredBytes: expired * per,
      estimatedRetainedMB: ((retained * per) / 1024 / 1024).toFixed(2),
      estimatedExpiredMB: ((expired * per) / 1024 / 1024).toFixed(2),
    };
  } catch (err) {
    console.error('❌ [chamaRetention] Error calculating storage usage:', err);
    return {
      totalRecords: 0, retained: 0, expired: 0, synced: 0, pending: 0, canDelete: 0,
      estimatedRetainedBytes: 0, estimatedExpiredBytes: 0, estimatedRetainedMB: '0.00', estimatedExpiredMB: '0.00',
    };
  }
}

export default {
  CHAMA_RETENTION_CONFIG,
  CHAMA_COLLECTIONS,
  getRetentionCutoffDate,
  getRecordTimestamp,
  isWithinRetentionWindow,
  getDaysUntilDeletion,
  getChamaRecordRetentionStatus,
  getRecordsEligibleForDeletion,
  filterToRetentionWindow,
  clampDateRangeToRetention,
  getStorageUsageSummary,
};