// rider-app/src/offline/businessRepository.js
// SMART BIZNA wiring: the pure offline store (businessStore.js) connected to IndexedDB, the sync queue and the clock. Screens import THIS file.
// Same role as chamaRepository.js / tripsRepository.js: the one door to the business data on the phone.
//
// MULTIPLE BUSINESSES: every business has its OWN store (own keys). The default export `store` below always talks to the business that is OPEN
// (chosen when the call starts, so a call that began in business A finishes in business A). The sync cycle never uses it: it names each
// business explicitly with scoped(id). There is no way to reach business data without naming, or having open, one business of this person.
import indexedDbAdapter from './adapters/indexedDbAdapter';
import { addToSyncQueue, loadSyncQueue } from './syncQueue';
import { getLocalRiderId, getLocalRiderStatus } from './db';
import { createBusinessStore, BusinessRuleError, VOID_REASONS } from './businessStore';
import { createBusinessRegistry } from './businessRegistry';
import { profileFromStatus } from '../auth/businessStatus';      // SMART BIZNA FIX

export const BUSINESS_QUEUE_TYPES = ['sale_service_entry', 'purchase_entry', 'expense_entry', 'record_correction', 'record_void',
  'business_statement_request', 'business_lipa_payment', 'supplier_lipa_payment'];

/** client id -> {status, error} for every item of ONE business still waiting in the sync queue (also a correction / void, under the record it changes).
 *  Used ONLY by the sync cycle, so a change still waiting on this phone is not overwritten by the server's older copy. Never shown to the user: syncing is silent.
 *  DATA ISOLATION: only that business's items count; the queue holds every business's items, each marked with its own business id. */
export async function readPendingMap(businessId) {
  const map = new Map();
  const want = String(businessId || '').toLowerCase();
  if (!want) return map;
  try {
    (await loadSyncQueue() || []).forEach((q) => {
      if (!q || q.status === 'synced' || !BUSINESS_QUEUE_TYPES.includes(q.type)) return;
      if (String(q.data && q.data.business_id || '').toLowerCase() !== want) return;
      const hit = { status: q.status || 'pending', error: q.lastError || null };
      if (q.data && q.data.client_id) map.set(String(q.data.client_id), hit);
      if (q.data && q.data.record_client_id) map.set(String(q.data.record_client_id), hit);
    });
  } catch { /* an unreadable queue means "unknown", shown as synced */ }
  return map;
}

const kv = { get: (k) => indexedDbAdapter.kvGet(k), set: (k, v) => indexedDbAdapter.kvSet(k, v) };
/** The client ids of every line (and change to a line) of THIS business still waiting in the sync queue. A day's lines are deleted on the phone only after none of them is waiting. */
const pendingClientIds = (businessId) => async () => {
  const out = new Set();
  try {
    (await loadSyncQueue()).forEach((q) => {
      if (!q || q.status === 'synced' || !q.data || String(q.data.business_id || '').toLowerCase() !== String(businessId).toLowerCase()) return;
      ['client_id', 'record_client_id', 'sale_client_id', 'purchase_client_id'].forEach((k) => { if (q.data[k]) out.add(q.data[k]); });
    });
  } catch (e) { /* unreadable queue: treat as nothing waiting is unknown -> keep everything */ out.add('__unknown__'); }
  return out;
};
const makeStore = (businessId) => createBusinessStore({ kv, enqueue: (item) => addToSyncQueue(item), pendingClientIds: pendingClientIds(businessId), identity: async () => ({ rider_id: await getLocalRiderId() }), businessId });
export const registry = createBusinessRegistry({ kv, makeStore });

let migrated = null;
/** The old single-business data is copied under its own business id once (never deleted). Every entry point below waits for this. */
export function ensureMigrated() {
  if (!migrated) migrated = (async () => { if ((await kv.get('biz_migrated_v1')) == null) await registry.migrateLegacy(); })().catch(() => { migrated = null; });
  return migrated;
}

/** The store of ONE named business of this person. Refuses a missing id or a business that is not theirs. */
export async function scoped(businessId) { await ensureMigrated(); return registry.store(businessId); }

const PURE = new Set(['isOwner', 'canSee']);
const sample = makeStore('00000000-0000-0000-0000-000000000000');
/** `store.recordSale(...)` etc. always act on the OPEN business, chosen at the start of the call. */
const store = {};
Object.keys(sample).forEach((name) => {
  if (name === 'businessId') return;
  store[name] = PURE.has(name) ? sample[name] : async (...args) => { await ensureMigrated(); const s = await registry.activeStore(); return s[name](...args); };
});

/** The person chose another business. */
export async function switchBusiness(id) { await ensureMigrated(); return registry.switchTo(id); }

/**
 * Before the first /business/my-businesses answer arrives (a brand-new phone, maybe offline) the profile is built from what Setup My Profile saved,
 * so the Home is right and a first sale can be recorded straight away. The server's answer replaces it at the next sync.
 */
export async function ensureBusinessProfile() {
  await ensureMigrated();
  const id = await registry.resolveActive();
  if (id) {
    const have = await (await registry.store(id)).getProfile();
    if (have && have.business_id) return have;
  }
  const st = await getLocalRiderStatus();
  if (st && Array.isArray(st.business_profiles) && st.business_profiles.length) {          // SMART BIZNA FIX: what the server said at set-up / login, permissions included
    await registry.saveMine(st.business_profiles);
    await registry.resolveActive();
    return (await registry.activeStore()).getProfile();
  }
  const profile = profileFromStatus(st);     // SMART BIZNA FIX: never a guess. It used to say "Sales/Service Person, nothing enabled" for anyone whose role was not saved
  if (!profile) return null;
  await registry.addBusiness(profile);
  await registry.resolveActive();
  return (await registry.activeStore()).getProfile();
}

/** SMART BIZNA FIX: save the businesses the server sent with a login, so the Home opens with the Administrator's real role and tile permissions at once. */
export async function seedBusinesses(profiles) {
  const list = (Array.isArray(profiles) ? profiles : []).filter((p) => p && p.business_id);
  if (!list.length) return false;
  await ensureMigrated();
  await registry.saveMine(list);
  await registry.resolveActive();
  return true;
}

export { BusinessRuleError, VOID_REASONS };
export default store;
