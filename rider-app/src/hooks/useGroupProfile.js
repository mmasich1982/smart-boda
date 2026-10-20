// rider-app/src/hooks/useGroupProfile.js
// has_group / group_type ('tb' | 'mgr' | null). Refreshes each time the screen is shown.
// Offline-first: starts from the membership saved in IndexedDB, then updates from the server when online.
// (The My Savings / My Loans screens are wrapped in ChamaOnlineGate, so by the time they mount we are online.)
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getMembership } from '../offline/chamaRepository';
import { refreshMembership } from '../offline/chamaSyncService';

export default function useGroupProfile() {
  const [p, setP] = useState({ loading: true, has_group: false, group_type: null });

  useEffect(() => {
    let alive = true;
    getMembership().then((m) => { if (alive && m?.has_group) setP((x) => (x.loading ? { loading: true, has_group: m.has_group, group_type: m.group_type } : x)); });
    return () => { alive = false; };
  }, []);

  useFocusEffect(useCallback(() => {
    let alive = true;
    refreshMembership().then((r) => {
      if (!alive) return;
      const m = r?.membership || {};
      setP({ loading: false, has_group: !!m.has_group, group_type: m.group_type || null });
    });
    return () => { alive = false; };
  }, []));

  return p;
}
