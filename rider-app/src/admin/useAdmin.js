// rider-app/src/admin/useAdmin.js
// ADMIN APP: who is signed in (from the phone, so the Home opens at once) and the numbers waiting for them (from the server).
import { useCallback, useEffect, useRef, useState } from 'react';
import { getLocalRiderStatus, saveLocalRiderStatus } from '../offline/db';
import { getMe, getDashboard } from './adminApi';
import { renewAdminSession } from './adminSession';

/** { admin: {name, role, mobile_number}, loaded }. Refreshes name and role from the server once per opening and renews the token (never signs out by itself). */
export default function useAdmin() {
  const [state, setState] = useState({ admin: { name: '', role: null, mobile_number: '' }, loaded: false });
  useEffect(() => {
    let live = true;
    (async () => {
      const st = (await getLocalRiderStatus().catch(() => null)) || {};
      if (live) setState({ admin: { name: st.full_name || '', role: st.role || null, mobile_number: st.mobile_number || '' }, loaded: true });
      if (!st.admin_id) return;
      renewAdminSession().catch(() => {});
      try {
        const me = await getMe();
        if (!live || !me) return;
        setState({ admin: { name: me.name, role: me.role, mobile_number: me.mobile_number || st.mobile_number || '' }, loaded: true });
        if (me.name !== st.full_name || me.role !== st.role) await saveLocalRiderStatus({ ...st, full_name: me.name, role: me.role });
      } catch (e) { /* offline or expired: the screens that need the server say so */ }
    })();
    return () => { live = false; };
  }, []);
  return state;
}

/** The dashboard numbers, loaded each time the screen comes into view (so a tile badge is right after you decide a request). */
export function useDashboardStats(navigation) {
  const [state, setState] = useState({ stats: null, error: null, loading: true });
  const seq = useRef(0);
  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    setState((x) => ({ ...x, loading: true, error: null }));
    try {
      const stats = await getDashboard();
      if (mine === seq.current) setState({ stats, error: null, loading: false });
    } catch (e) {
      if (mine === seq.current) setState((x) => ({ ...x, loading: false, error: 'We could not load the numbers. Check your internet and try again.' }));
    }
  }, []);
  useEffect(() => {
    refresh();
    const off = navigation && navigation.addListener ? navigation.addListener('focus', refresh) : null;
    return () => { if (off) off(); };
  }, [refresh, navigation]);
  return { ...state, refresh };
}
