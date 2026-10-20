// rider-app/src/hooks/useChamaMembership.js
// ============================================================================
// SYSTEM-DRIVEN CHAMA MEMBERSHIP (drives the My Savings / My Loans tiles on Home)
// ============================================================================
// The tiles appear when the rider is an ACTIVE member of a Chama group (added by the group's Treasurer) and
// disappear when they are not. The rider does nothing. The server (/chama/me/profile) is the only authority.
//
// How it stays current:
//   1. Instantly on open : the last known membership is read from IndexedDB, so the tiles are right offline.
//   2. On screen focus, when the app returns to the foreground, and when the connection comes back.
//   3. Every 45 seconds while Home is on screen (a Treasurer adding the rider shows up within a minute).
//   4. Immediately when a membership notice arrives (see useServerNotifications / chamaSyncService).
//   5. In the background after every SyncOrchestrator cycle.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useNetworkStatus } from './useNetworkStatus';
import { getMembership, EMPTY_MEMBERSHIP } from '../offline/chamaRepository';
import { refreshMembership, subscribeMembership } from '../offline/chamaSyncService';

export const MEMBERSHIP_POLL_MS = 45000;

export default function useChamaMembership({ pollMs = MEMBERSHIP_POLL_MS } = {}) {
  const [membership, setMembership] = useState({ ...EMPTY_MEMBERSHIP });
  const [loaded, setLoaded] = useState(false);
  const { isConnected } = useNetworkStatus();
  const focused = useRef(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const r = await refreshMembership();                       // never throws; keeps the saved copy on failure
    if (mounted.current && r?.membership) setMembership((prev) => ({ ...prev, ...r.membership }));
    return r;
  }, []);

  // 1. saved copy first
  useEffect(() => {
    mounted.current = true;
    getMembership().then((m) => { if (mounted.current) { setMembership((prev) => ({ ...prev, ...m })); setLoaded(true); } });
    return () => { mounted.current = false; };
  }, []);

  // 5 / 4. changes announced elsewhere (sync cycle, notification)
  useEffect(() => subscribeMembership((m) => { if (mounted.current) setMembership((prev) => ({ ...prev, ...m })); }), []);

  // 2 + 3. focus, polling
  useFocusEffect(useCallback(() => {
    focused.current = true;
    refresh();
    const timer = setInterval(() => { if (focused.current) refresh(); }, pollMs);
    return () => { focused.current = false; clearInterval(timer); };
  }, [refresh, pollMs]));

  // 2. app foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active' && focused.current) refresh(); });
    return () => sub?.remove?.();
  }, [refresh]);

  // 2. connection restored
  useEffect(() => { if (isConnected && focused.current) refresh(); }, [isConnected, refresh]);

  return {
    loaded,
    hasGroup: !!membership.has_group,
    groupType: membership.group_type || null,
    groupName: membership.group_name || null,
    isTreasurer: !!membership.is_treasurer,
    // true while the administrator has named this rider Treasurer of a group whose Chama Code they have not entered yet.
    // A Treasurer of one group can still be invited to another, so this does not depend on isTreasurer.
    treasurerInvite: !!membership.treasurer_invite || (membership.treasurer_invites || []).length > 0,
    treasurerInviteGroup: membership.treasurer_invite_group || (membership.treasurer_invites || [])[0]?.group_name || null,
    treasurerInvites: membership.treasurer_invites || [],
    memberships: membership.memberships || [],
    hasMgr: !!membership.has_mgr || ((membership.memberships || []).length === 0 && membership.group_type === 'mgr'),
    hasTb: !!membership.has_tb || ((membership.memberships || []).length === 0 && membership.group_type === 'tb'),   // older saved copies only know group_type
    treasurerGroups: membership.treasurer_groups || [],
    membership,
    refresh,
  };
}
