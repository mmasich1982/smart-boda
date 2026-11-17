// rider-app/src/hooks/useBusiness.js
// SMART BIZNA hooks. Everything is read from the phone first (works offline); the profile refreshes in the background.
// MULTIPLE BUSINESSES: every hook follows the business that is OPEN, and a result that arrives after the person switched to another business is
// thrown away (each hook remembers the business session it started in and checks it before showing anything).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import store, { registry, ensureBusinessProfile } from '../offline/businessRepository';
import { subscribeBusinessProfile, subscribeBusinessList, refreshBusinessProfile } from '../offline/businessSyncService';

export const PROFILE_POLL_MS = 45000;

/** {id, epoch} of the business that is open. Changes every time the person switches (the navigator uses it to rebuild every screen). */
export function useBusinessSession() {
  const [session, setSession] = useState(registry.token());
  useEffect(() => {
    let on = true;
    ensureBusinessProfile().then(() => registry.resolveActive()).then(() => on && setSession(registry.token())).catch(() => {});
    const off = registry.subscribe(() => on && setSession(registry.token()));
    return () => { on = false; off(); };
  }, []);
  return session;
}

/** The saved business profile of the OPEN business (role, business, active flag, the person's two tile permissions). Updates by itself when the Administrator changes something. */
export function useBusinessProfile() {
  const [profile, setProfile] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const mounted = useRef(true);
  const load = useCallback(async () => {
    const t = registry.token();
    try {
      const p = await ensureBusinessProfile();
      if (mounted.current && (!p || registry.token().id === p.business_id) && (t.id === null || registry.isCurrent(registry.token()))) setProfile(p);
    } catch { /* keep what is shown */ }
    if (mounted.current) setLoaded(true);
  }, []);
  useEffect(() => {
    mounted.current = true;
    load();
    const off = subscribeBusinessProfile((p) => mounted.current && p && registry.token().id === p.business_id && setProfile(p));
    const offSwitch = registry.subscribe(() => { if (mounted.current) { setLoaded(false); setProfile(null); load(); } });
    const timer = setInterval(() => { refreshBusinessProfile().catch(() => {}); }, PROFILE_POLL_MS);
    return () => { mounted.current = false; off(); offSwitch(); clearInterval(timer); };
  }, [load]);
  useFocusEffect(useCallback(() => { refreshBusinessProfile().catch(() => {}); store.getProfile().then((p) => mounted.current && p && registry.token().id === p.business_id && setProfile(p)).catch(() => {}); }, []));
  return { profile, loaded };
}

/** The businesses this person holds (name, type, role, active) and which one is open. Updates when the Administrator adds or switches one off. */
export function useMyBusinesses() {
  const [state, setState] = useState({ businesses: [], activeId: null, ready: false });
  const mounted = useRef(true);
  const load = useCallback(async () => {
    try {
      await ensureBusinessProfile();
      const [businesses, activeId] = [await registry.getMine(), await registry.resolveActive()];
      if (mounted.current) setState({ businesses, activeId, ready: true });
    } catch { if (mounted.current) setState((s) => ({ ...s, ready: true })); }
  }, []);
  useEffect(() => {
    mounted.current = true; load();
    const offList = subscribeBusinessList(() => load()); const offSwitch = registry.subscribe(() => load());
    return () => { mounted.current = false; offList(); offSwitch(); };
  }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return { ...state, reload: load };
}

/**
 * A half-entered form that stays with ITS business. Loaded from, and saved to, the business that was open when the screen opened (never "whichever is open
 * later"), so a sale typed in the hardware shop is still there when the Owner comes back to it and never appears in the pharmacy.
 * Returns {value, setValue, clear, ready}. Never throws.
 */
export function useBizDraft(name, initial) {
  const [value, setValueState] = useState(initial);
  const [ready, setReady] = useState(false);
  const owner = useRef(null);
  const latest = useRef(initial);
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const s = await registry.activeStore();
        owner.current = s;
        const d = await s.getDraft(name);
        if (on && d && d.value != null) { latest.current = d.value; setValueState(d.value); }
      } catch { /* no draft */ }
      if (on) setReady(true);
    })();
    return () => { on = false; };
  }, [name]);
  // setValue accepts a value or an updater (v) => next, so quick successive changes never overwrite each other
  const setValue = useCallback((v) => { const next = typeof v === 'function' ? v(latest.current) : v; latest.current = next; setValueState(next); if (owner.current) owner.current.saveDraft(name, next).catch(() => {}); }, [name]);
  const clear = useCallback(() => { latest.current = initial; setValueState(initial); if (owner.current) owner.current.clearDraft(name).catch(() => {}); }, [name]); // eslint-disable-line react-hooks/exhaustive-deps
  return { value, setValue, clear, ready };
}

/**
 * Run an async loader against the phone's data: on open, on every focus, and every 15 s while visible (so what has just synced shows its
 * the record shows its final state). Returns {data, loading, reload}. Never throws.
 * MULTIPLE BUSINESSES: a result is shown only if the business session is still the one the load started in.
 */
export function useBizData(loader, deps = [], { pollMs = 15000 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const reload = useCallback(async () => {
    const t = registry.token();
    try { const d = await loaderRef.current(); if (mounted.current && registry.isCurrent(t)) setData(d); } catch (e) { /* keep what is shown */ }
    if (mounted.current) setLoading(false);
  }, []);
  useEffect(() => { mounted.current = true; reload(); const t = pollMs ? setInterval(reload, pollMs) : null; return () => { mounted.current = false; if (t) clearInterval(t); }; }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  return { data, loading, reload };
}
