// rider-app/src/offline/chamaRepository.js
// ============================================================================
// CHAMA REPOSITORY - IndexedDB local-first storage for My Savings / My Loans / My Chama
// ============================================================================
//
// Follows the same pattern as tripsRepository.js and financialHistoryRepository.js:
//   • every read and write goes through indexedDbAdapter (no localStorage anywhere)
//   • records carry rider_id / ts / syncStatus, just like fuel_entry_* and trips
//   • a rolling 6-month retention window (see chamaRetentionPolicy.js) with a weekly, safe cleanup
//
// WHAT IS STORED
//   chamaRecords store     : history rows (contributions, repayments, deposits, ledger entries, notices)
//   chama_snapshot_*       : the last good server answer for each screen (summary, board, state …)
//   chama_membership_*     : has_group / group_type / roles, so the Home tiles are right even offline
//   chama_retention_config_*: when the last cleanup ran
//
// WHAT IS *NOT* STORED HERE
//   Money-moving actions (pay, apply, repay, confirm, approve). Those need a live connection by design
//   (see chamaConnectivity.js) and are never replayed from a queue.
// ============================================================================

import indexedDbAdapter from './adapters/indexedDbAdapter';
import { getLocalRiderId, getLocalRiderStatus, saveLocalRiderStatus } from './db';
import { clearMgrHistoryKv } from './chamaMgrHistoryRepository';
import {
  CHAMA_RETENTION_CONFIG,
  CHAMA_COLLECTIONS,
  getRetentionCutoffDate,
  getRecordTimestamp,
  isWithinRetentionWindow,
  getRecordsEligibleForDeletion,
  filterToRetentionWindow,
  getStorageUsageSummary,
} from './chamaRetentionPolicy';

export const CHAMA_STORE = 'chamaRecords';

const SNAPSHOT_PREFIX = 'chama_snapshot_';
const SNAPSHOT_INDEX_PREFIX = 'chama_snapshot_index_';
const MEMBERSHIP_PREFIX = 'chama_membership_';
const RETENTION_CONFIG_PREFIX = 'chama_retention_config_';
const NOTIFICATIONS_PREFIX = 'chama_notifications_';

const parse = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return null; }
  }
  return v;
};

async function resolveRiderId(riderId) {
  if (riderId) return riderId;
  try {
    return (await getLocalRiderId()) || null;
  } catch {
    return null;
  }
}

// ============================================================================
// SNAPSHOTS: last good server answer for a screen
// ============================================================================

/**
 * Drop expired entries from any top-level list inside a snapshot (contributions, payments, history …).
 * Lists whose items have no readable date are left alone.
 */
export function pruneSnapshotForRetention(data, cutoff = getRetentionCutoffDate()) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const out = { ...data };
  Object.keys(out).forEach((k) => {
    const v = out[k];
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
      out[k] = filterToRetentionWindow(v, cutoff);
    }
  });
  return out;
}

export async function saveSnapshot(key, data, riderId) {
  try {
    const rid = await resolveRiderId(riderId);
    if (!rid) return false;
    const full = `${SNAPSHOT_PREFIX}${rid}_${key}`;
    await indexedDbAdapter.kvSet(full, { data: pruneSnapshotForRetention(data), savedAt: Date.now(), version: 1 });

    // keep an index of the keys so logout / cleanup can remove them all
    const idxKey = `${SNAPSHOT_INDEX_PREFIX}${rid}`;
    const idx = parse(await indexedDbAdapter.kvGet(idxKey)) || [];
    if (!idx.includes(key)) {
      idx.push(key);
      await indexedDbAdapter.kvSet(idxKey, idx);
    }
    return true;
  } catch (err) {
    console.warn('⚠️ [chamaRepository] saveSnapshot failed:', err?.message);
    return false;
  }
}

/**
 * @returns {Promise<{data:any, savedAt:number}|null>}
 */
export async function getSnapshot(key, riderId) {
  try {
    const rid = await resolveRiderId(riderId);
    if (!rid) return null;
    const raw = parse(await indexedDbAdapter.kvGet(`${SNAPSHOT_PREFIX}${rid}_${key}`));
    if (!raw || raw.data === undefined) return null;
    return { data: pruneSnapshotForRetention(raw.data), savedAt: raw.savedAt || 0 };
  } catch (err) {
    console.warn('⚠️ [chamaRepository] getSnapshot failed:', err?.message);
    return null;
  }
}

// ============================================================================
// HISTORY ROWS (chamaRecords store)
// ============================================================================

const recordId = (collection, riderId, item, index) => `chama_${collection}_${riderId}_${item?.id ?? `${getRecordTimestamp(item) || 'x'}_${index}`}`;

/**
 * Mirror a list the server just returned into the chamaRecords store.
 * Rows are upserted (a pending row that became confirmed overwrites itself). Expired rows are not stored.
 */
export async function mirrorHistory(collection, items, riderId) {
  try {
    const rid = await resolveRiderId(riderId);
    if (!rid || !Array.isArray(items) || items.length === 0) return 0;
    if (!CHAMA_COLLECTIONS.includes(collection)) {
      console.warn('⚠️ [chamaRepository] Unknown collection, skipping mirror:', collection);
      return 0;
    }
    const cutoff = getRetentionCutoffDate();
    const rows = [];
    items.forEach((item, i) => {
      const ts = getRecordTimestamp(item);
      if (ts !== null && !isWithinRetentionWindow(ts, cutoff)) return; // do not cache what is already expired
      rows.push({
        id: recordId(collection, rid, item, i),
        rider_id: rid,
        collection,
        ts: ts || Date.now(),
        timestamp: ts || Date.now(),
        date: new Date(ts || Date.now()).toISOString().slice(0, 10),
        createdAt: new Date(ts || Date.now()).toISOString(),
        syncStatus: 'synced', // the server gave us this row, so it is already safe on the server
        status: item?.status || 'active',
        payload: item,
        cachedAt: Date.now(),
      });
    });
    if (rows.length) await indexedDbAdapter.batchInsert(CHAMA_STORE, rows);
    return rows.length;
  } catch (err) {
    console.warn('⚠️ [chamaRepository] mirrorHistory failed:', err?.message);
    return 0;
  }
}

/**
 * Read a history collection from the phone, newest first, inside the retention window.
 * @param {string} collection
 * @param {{riderId?:string, fromMs?:number, toMs?:number, limit?:number}} [opts]
 */
export async function getHistory(collection, opts = {}) {
  try {
    const rid = await resolveRiderId(opts.riderId);
    if (!rid) return [];
    const cutoff = getRetentionCutoffDate();
    const rows = await indexedDbAdapter.queryRows(CHAMA_STORE, (r) =>
      r.rider_id === rid && r.collection === collection && isWithinRetentionWindow(r.ts, cutoff) &&
      (opts.fromMs === undefined || r.ts >= opts.fromMs) && (opts.toMs === undefined || r.ts <= opts.toMs));
    rows.sort((a, b) => b.ts - a.ts);
    const list = rows.map((r) => r.payload);
    return opts.limit ? list.slice(0, opts.limit) : list;
  } catch (err) {
    console.warn('⚠️ [chamaRepository] getHistory failed:', err?.message);
    return [];
  }
}

// ============================================================================
// MEMBERSHIP (drives the Home tiles, works offline)
// ============================================================================

export const EMPTY_MEMBERSHIP = Object.freeze({
  has_group: false, group_type: null, group_name: null, is_treasurer: false,
  // The administrator named this rider as a group's Treasurer and they have not entered the Chama Code yet.
  // Drives the "Enter your Chama Code" card on Home. False for every ordinary rider.
  treasurer_invite: false, treasurer_invite_group: null,
  // A rider can be in several groups. These lists drive My Savings / My Loans tabs and the Manage Chama tabs.
  memberships: [], has_mgr: false, has_tb: false,
  treasurer_groups: [], treasurer_invites: [],
  savedAt: 0,
});

/**
 * Last known membership. Falls back to the flags older versions stored on rider_status so an upgrade does
 * not make the tiles vanish until the first online refresh.
 */
export async function getMembership(riderId) {
  try {
    const rid = await resolveRiderId(riderId);
    if (rid) {
      const cached = parse(await indexedDbAdapter.kvGet(`${MEMBERSHIP_PREFIX}${rid}`));
      if (cached && typeof cached === 'object') return { ...EMPTY_MEMBERSHIP, ...cached };
    }
    const st = (await getLocalRiderStatus().catch(() => null)) || {};
    return {
      ...EMPTY_MEMBERSHIP,
      has_group: !!st.has_group,
      group_type: st.group_type || null,
      // is_treasurer is NOT taken from the old self-declared flag any more: only the server (a group naming this rider) decides.
      is_treasurer: false,
    };
  } catch (err) {
    console.warn('⚠️ [chamaRepository] getMembership failed:', err?.message);
    return { ...EMPTY_MEMBERSHIP };
  }
}

/**
 * Save the membership the SERVER just reported. Also mirrors the flags onto rider_status because
 * screens read is_treasurer from there.
 * @returns {Promise<{changed:boolean, membership:object}>}
 */
export async function saveMembership(profile, riderId) {
  const next = {
    has_group: !!profile?.has_group,
    group_type: profile?.group_type || null,
    group_name: profile?.group_name || null,
    is_treasurer: !!profile?.is_treasurer,
    treasurer_invite: !!profile?.treasurer_invite,
    treasurer_invite_group: profile?.treasurer_invite_group || null,
    memberships: profile?.memberships || [],
    has_mgr: !!profile?.has_mgr, has_tb: !!profile?.has_tb,
    treasurer_groups: profile?.treasurer_groups || [],
    treasurer_invites: profile?.treasurer_invites || [],
    savedAt: Date.now(),
  };
  try {
    const rid = await resolveRiderId(riderId);
    const prev = await getMembership(rid);
    const changed =
      prev.has_group !== next.has_group || prev.group_type !== next.group_type ||
      prev.is_treasurer !== next.is_treasurer ||
      prev.treasurer_invite !== next.treasurer_invite ||
      prev.has_mgr !== next.has_mgr || prev.has_tb !== next.has_tb ||
      JSON.stringify(prev.treasurer_groups) !== JSON.stringify(next.treasurer_groups) ||
      JSON.stringify(prev.treasurer_invites) !== JSON.stringify(next.treasurer_invites) ||
      JSON.stringify((prev.memberships || []).map((m) => m.group_id)) !== JSON.stringify(next.memberships.map((m) => m.group_id));
    if (rid) await indexedDbAdapter.kvSet(`${MEMBERSHIP_PREFIX}${rid}`, next);

    const st = (await getLocalRiderStatus().catch(() => null)) || {};
    const { rider_id: _ignored, ...status } = st; // getLocalRiderStatus merges rider_id in; do not write it back
    await saveLocalRiderStatus({
      ...status,
      has_group: next.has_group,
      group_type: next.group_type,
      is_treasurer: next.is_treasurer,
    });
    return { changed, membership: next };
  } catch (err) {
    console.warn('⚠️ [chamaRepository] saveMembership failed:', err?.message);
    return { changed: false, membership: next };
  }
}

// ============================================================================
// NOTIFICATIONS (bell items, so the bell is not empty when the app opens offline)
// ============================================================================

export async function saveNotifications(items, riderId) {
  try {
    const rid = await resolveRiderId(riderId);
    if (!rid) return false;
    await indexedDbAdapter.kvSet(`${NOTIFICATIONS_PREFIX}${rid}`, { items: items || [], savedAt: Date.now() });
    return true;
  } catch { return false; }
}

export async function getNotifications(riderId) {
  try {
    const rid = await resolveRiderId(riderId);
    if (!rid) return [];
    const raw = parse(await indexedDbAdapter.kvGet(`${NOTIFICATIONS_PREFIX}${rid}`));
    return Array.isArray(raw?.items) ? raw.items : [];
  } catch { return []; }
}

// ============================================================================
// RETENTION: configuration, status and cleanup
// ============================================================================

export async function getRetentionConfig(riderId) {
  const rid = await resolveRiderId(riderId);
  if (!rid) return null;
  return parse(await indexedDbAdapter.kvGet(`${RETENTION_CONFIG_PREFIX}${rid}`));
}

export async function initializeRetentionConfig(riderId) {
  const rid = await resolveRiderId(riderId);
  if (!rid) return null;
  const existing = await getRetentionConfig(rid);
  if (existing) return existing;
  const now = Date.now();
  const config = {
    riderId: rid,
    createdAt: now,
    lastCleanupAt: null,
    nextCleanupAt: now + CHAMA_RETENTION_CONFIG.CLEANUP_INTERVAL_MS,
    lastCleanupResult: null,
  };
  await indexedDbAdapter.kvSet(`${RETENTION_CONFIG_PREFIX}${rid}`, config);
  return config;
}

/**
 * Remove history rows that are older than 6 months AND already on the server.
 *
 * Skipped when: offline (the person may be reading old data), or a cleanup ran within the last week
 * (unless force is true). Pending / failed rows are never touched.
 *
 * @param {{riderId?:string, force?:boolean, online?:boolean}} [opts]
 */
export async function runRetentionCleanup(opts = {}) {
  const { force = false, online = true } = opts;
  try {
    const rid = await resolveRiderId(opts.riderId);
    if (!rid) return { skipped: true, reason: 'no_rider' };
    if (!online) return { skipped: true, reason: 'offline' };

    const config = (await initializeRetentionConfig(rid)) || {};
    const now = Date.now();
    if (!force && config.nextCleanupAt && now < config.nextCleanupAt) {
      return { skipped: true, reason: 'not_due', nextCleanupAt: config.nextCleanupAt };
    }

    const cutoff = getRetentionCutoffDate();
    const rows = await indexedDbAdapter.queryRows(CHAMA_STORE, (r) => r.rider_id === rid);
    const deletable = getRecordsEligibleForDeletion(rows, cutoff);

    let deleted = 0;
    for (const row of deletable) {
      try {
        await indexedDbAdapter.deleteRow(CHAMA_STORE, row.id);
        deleted += 1;
      } catch (err) {
        console.warn('⚠️ [chamaRepository] could not delete', row.id, err?.message);
      }
    }

    const result = { deleted, scanned: rows.length, cutoff: cutoff.toISOString(), ranAt: now };
    await indexedDbAdapter.kvSet(`${RETENTION_CONFIG_PREFIX}${rid}`, {
      ...config,
      lastCleanupAt: now,
      nextCleanupAt: now + CHAMA_RETENTION_CONFIG.CLEANUP_INTERVAL_MS,
      lastCleanupResult: result,
    });
    console.log(`🧹 [chamaRepository] Retention cleanup: ${deleted} of ${rows.length} rows removed (older than ${cutoff.toISOString().slice(0, 10)})`);
    return { skipped: false, ...result };
  } catch (err) {
    console.error('❌ [chamaRepository] runRetentionCleanup error:', err);
    return { skipped: true, reason: 'error', error: err?.message };
  }
}

/**
 * Retention status for diagnostics / a future "storage" screen.
 */
export async function getRetentionStatus(riderId) {
  const rid = await resolveRiderId(riderId);
  const cutoff = getRetentionCutoffDate();
  if (!rid) return { cutoff: cutoff.toISOString(), summary: getStorageUsageSummary([], cutoff), config: null };
  const rows = await indexedDbAdapter.queryRows(CHAMA_STORE, (r) => r.rider_id === rid);
  return { cutoff: cutoff.toISOString(), summary: getStorageUsageSummary(rows, cutoff), config: await getRetentionConfig(rid) };
}

// ============================================================================
// LOGOUT / SWITCH ACCOUNT: remove this rider's Chama data from the phone
// ============================================================================

export async function clearChamaData(riderId) {
  try {
    const rid = await resolveRiderId(riderId);
    if (!rid) return false;

    const rows = await indexedDbAdapter.queryRows(CHAMA_STORE, (r) => r.rider_id === rid);
    for (const row of rows) {
      await indexedDbAdapter.deleteRow(CHAMA_STORE, row.id).catch(() => {});
    }

    const idxKey = `${SNAPSHOT_INDEX_PREFIX}${rid}`;
    const idx = parse(await indexedDbAdapter.kvGet(idxKey)) || [];
    for (const key of idx) await indexedDbAdapter.kvDelete(`${SNAPSHOT_PREFIX}${rid}_${key}`).catch(() => {});
    await indexedDbAdapter.kvDelete(idxKey).catch(() => {});
    await indexedDbAdapter.kvDelete(`${MEMBERSHIP_PREFIX}${rid}`).catch(() => {});
    await indexedDbAdapter.kvDelete(`${NOTIFICATIONS_PREFIX}${rid}`).catch(() => {});
    await indexedDbAdapter.kvDelete(`${RETENTION_CONFIG_PREFIX}${rid}`).catch(() => {});
    await clearMgrHistoryKv(rid).catch(() => {});       // contribution-history cursors and totals (their rows went with the rest above)
    console.log(`🧹 [chamaRepository] Cleared Chama data for rider ${rid}`);
    return true;
  } catch (err) {
    console.warn('⚠️ [chamaRepository] clearChamaData failed:', err?.message);
    return false;
  }
}

export default {
  CHAMA_STORE,
  EMPTY_MEMBERSHIP,
  pruneSnapshotForRetention,
  saveSnapshot,
  getSnapshot,
  mirrorHistory,
  getHistory,
  getMembership,
  saveMembership,
  saveNotifications,
  getNotifications,
  getRetentionConfig,
  initializeRetentionConfig,
  runRetentionCleanup,
  getRetentionStatus,
  clearChamaData,
};