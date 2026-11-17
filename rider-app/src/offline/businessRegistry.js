// rider-app/src/offline/businessRegistry.js
// MULTIPLE BUSINESSES: which businesses this phone holds, which one is open, and the ONLY door to a business's data.
// Pure (no React Native imports): the key-value map, the clock and the store factory are injected, so the isolation rules are tested in plain Jest.
//
//   biz_mine_v1     the list of the person's businesses (summary of each profile). A business that is not in this list cannot be opened.
//   biz_active_v1   the business last used; Home opens in it (stay-signed-in feature)
//   biz_migrated_v1 the one-time copy of the old single-business data
//
// DATA ISOLATION rules enforced here:
//   * store(id) REQUIRES an id of a business in the list; anything else is refused (NO_BUSINESS / NOT_YOUR_BUSINESS). There is no "current" fallback.
//   * every switch starts a new business SESSION {id, epoch}. Anything that was loading for the old session can ask isCurrent(token) before it saves
//     or shows a result, so a reply that arrives late for business A is thrown away, never written into business B.
import { scopedKey, LEGACY_KEYS, BusinessRuleError } from './businessStore';

const MINE_KEY = 'biz_mine_v1';
const ACTIVE_KEY = 'biz_active_v1';
const MIGRATED_KEY = 'biz_migrated_v1';
const SUMMARY_FIELDS = ['business_id', 'business_name', 'business_type_code', 'business_type_name', 'role', 'active', 'business_user_id', 'full_name'];

const rule = (code, message) => { throw new BusinessRuleError(code, message); };
const norm = (id) => String(id || '').trim().toLowerCase();

export function createBusinessRegistry({ kv, makeStore, now = () => Date.now() }) {
  const read = async (key, fallback) => { const v = await kv.get(key); if (v == null) return fallback; return typeof v === 'string' ? JSON.parse(v) : v; };
  const write = (key, value) => kv.set(key, JSON.stringify(value));
  const stores = new Map();
  let session = { id: null, epoch: 0 };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => { try { fn({ ...session }); } catch { /* a listener must never break a switch */ } });

  const getMine = () => read(MINE_KEY, []);

  /** Replace the list with what the server says this person holds. Each profile is saved in ITS OWN business's storage. A business that has
   *  gone from the list is no longer reachable (its stored data is left alone on the phone, but nothing can open it). */
  async function saveMine(profiles) {
    const list = [];
    for (const p of profiles || []) {
      if (!p || !norm(p.business_id)) continue;
      const id = norm(p.business_id);
      await makeStore(id).saveProfile({ ...p, business_id: id });
      list.push({ ...Object.fromEntries(SUMMARY_FIELDS.filter((k) => p[k] !== undefined).map((k) => [k, p[k]])), business_id: id });
    }
    await write(MINE_KEY, list);
    const act = await getActiveId();
    if (act && !list.some((b) => b.business_id === act)) { await kv.set(ACTIVE_KEY, null); if (session.id === act) { session = { id: null, epoch: session.epoch + 1 }; emit(); } }
    return list;
  }

  /** Add ONE business to the list without touching the others (a brand-new phone before the first server answer). */
  async function addBusiness(p) {
    const id = norm(p && p.business_id);
    if (!id) rule('NO_BUSINESS', 'No business was chosen, so nothing was opened.');
    await makeStore(id).saveProfile({ ...p, business_id: id });
    const mine = await getMine();
    const entry = { ...Object.fromEntries(SUMMARY_FIELDS.filter((k) => p[k] !== undefined).map((k) => [k, p[k]])), business_id: id };
    await write(MINE_KEY, mine.some((b) => b.business_id === id) ? mine.map((b) => (b.business_id === id ? entry : b)) : mine.concat([entry]));
    return entry;
  }

  const isKnown = async (id) => (await getMine()).some((b) => b.business_id === norm(id));

  /** The only way to get a business's store. Refuses a missing id and a business that is not this person's. Stores are cached per business. */
  async function store(id) {
    if (!norm(id)) rule('NO_BUSINESS', 'No business was chosen, so nothing was opened.');
    if (!(await isKnown(id))) rule('NOT_YOUR_BUSINESS', 'This business is not on your account.');
    const k = norm(id);
    if (!stores.has(k)) stores.set(k, makeStore(k));
    return stores.get(k);
  }

  async function getActiveId() { const v = await read(ACTIVE_KEY, null); return v ? norm(v) : null; }

  /** The business to open: the last one used if it is still usable, otherwise the first live one, otherwise the first one. null when the phone holds none. */
  async function resolveActive() {
    const mine = await getMine();
    if (!mine.length) return null;
    const act = await getActiveId();
    const live = (b) => b.active !== false;
    const pick = mine.find((b) => b.business_id === act && live(b)) || mine.find(live) || mine[0];
    if (session.id !== pick.business_id) { session = { id: pick.business_id, epoch: session.epoch + 1 }; emit(); }
    if (act !== pick.business_id) await write(ACTIVE_KEY, pick.business_id);
    return pick.business_id;
  }

  /** The person chose a business. Starts a new business session; everything still loading for the old one is now stale. */
  async function switchTo(id) {
    const mine = await getMine();
    const b = mine.find((x) => x.business_id === norm(id));
    if (!b) rule('NOT_YOUR_BUSINESS', 'This business is not on your account.');
    if (b.active === false) rule('ACCOUNT_INACTIVE', 'This business has been switched off by the Administrator.');
    await write(ACTIVE_KEY, b.business_id);
    session = { id: b.business_id, epoch: session.epoch + 1 };
    emit();
    return { ...session };
  }

  const activeStore = async () => { const id = await resolveActive(); return store(id); };

  /** A token for "what is open right now". Ask isCurrent(token) before saving or showing the result of anything that took time. */
  const token = () => ({ ...session });
  const isCurrent = (t) => !!t && t.id === session.id && t.epoch === session.epoch;
  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  /** One-time, repeatable, NEVER deleting: the old single-business data (no id in the key) is copied under its own business id. */
  async function migrateLegacy() {
    const old = await read(LEGACY_KEYS.profile, null);
    if (!old || !old.business_id) { await write(MIGRATED_KEY, { at: now(), copied: 0 }); return { copied: 0 }; }
    const id = norm(old.business_id);
    let copied = 0;
    for (const base of Object.values(LEGACY_KEYS)) {
      const have = await kv.get(scopedKey(base, id));
      const legacy = await kv.get(base);
      if (have == null && legacy != null) { await kv.set(scopedKey(base, id), legacy); copied += 1; }       // never overwrites; never removes the old key
    }
    const mine = await getMine();
    if (!mine.some((b) => b.business_id === id)) {
      await write(MINE_KEY, mine.concat([{ ...Object.fromEntries(SUMMARY_FIELDS.filter((k) => old[k] !== undefined).map((k) => [k, old[k]])), business_id: id }]));
    }
    if (!(await getActiveId())) await write(ACTIVE_KEY, id);
    await write(MIGRATED_KEY, { at: now(), copied });
    return { copied, businessId: id };
  }

  /** What the switcher shows for one business: has anything been loaded onto this phone for it yet? */
  async function status(id) {
    const s = await store(id);
    const d = await s.getData();
    const has = !!(d.meta && d.meta.lastPullAt) || [d.sales, d.purchases, d.expenses].some((l) => l.length);
    return { loaded: has, lastPullAt: (d.meta && d.meta.lastPullAt) || null };
  }

  return { getMine, saveMine, addBusiness, isKnown, store, activeStore, getActiveId, resolveActive, switchTo, token, isCurrent, subscribe, migrateLegacy, status };
}

export default { createBusinessRegistry };
