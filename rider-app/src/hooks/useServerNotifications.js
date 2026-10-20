// rider-app/src/hooks/useServerNotifications.js
// ✅ PART 5: turn swap notifications (swap_request_incoming, swap_needs_approval, swap_result)

import { useCallback, useEffect, useRef, useState } from 'react';
import { listNotifications, savedNotifications } from '../api/groupsClient';
import { useNetworkStatus } from './useNetworkStatus';

const ICON = { slot_request_approved: '✅', slot_request_declined: '❌', slot_request_pending: '⏳',
  contribution_pending: '📥', contribution_confirmed: '✅', contribution_rejected: '❌',
  loan_request_pending: '💳', loan_approved: '✅', loan_rejected: '❌',
  loan_payment_pending: '💳', loan_payment_confirmed: '✅', loan_payment_rejected: '❌',
  // Part 4
  mgr_payout_received: '💸',
  guarantee_request: '🤝', guarantee_accepted: '✅', guarantee_declined: '❌', security_release_due: '🔒',
  // Part 5: turn swaps (a notice is also written when a swap is approved, declined, cancelled or expires)
  swap_request_incoming: '🔁', swap_needs_approval: '🔁', swap_agreed: '🔁', swap_result: '🔁' };

const GO = { contribution_pending: ['ChamaQueue', { kind: 'contributions' }], loan_request_pending: ['ChamaQueue', { kind: 'loanRequests' }],
  loan_payment_pending: ['ChamaQueue', { kind: 'repayments' }], contribution_confirmed: ['MySavings'], contribution_rejected: ['MySavings'],
  loan_approved: ['MyLoans'], loan_rejected: ['MyLoans'], loan_payment_confirmed: ['MyLoans'], loan_payment_rejected: ['MyLoans'],
  // Part 4: Treasurer queues
  // Part 4: member notices
  mgr_payout_received: ['MySavings'],
  // Table Banking security: guarantors answer in Guarantee requests; the Treasurer gives security back from the register
  guarantee_request: ['GuaranteeRequests'], guarantee_accepted: ['MyLoans'], guarantee_declined: ['MyLoans'], security_release_due: ['SecurityHeld'],
  // Part 5: turn swaps
  swap_request_incoming: ['MySavings'], swap_agreed: ['MySavings'], swap_result: ['MySavings'], swap_needs_approval: ['MgrSwaps'] };

// Polls ONLY active notifications. Completed ones are never returned by the server,
// so they disappear from the bell without any extra code here.
const toItem = (n) => ({ icon: ICON[n.kind] || '🔔', title: n.title, detail: n.body,
  screen: (GO[n.kind] || ['ManageChama'])[0], params: (GO[n.kind] || [])[1],
  urgency: /pending$/.test(n.kind) && n.kind.startsWith('slot') ? 'warning' : 'critical', notifId: n.id });

// Offline-first: the bell shows the notices saved on the phone straight away, then refreshes from the server
// whenever there is a connection. While offline it simply keeps what it has (no errors, no spinner).
// A "you were added to a group" notice also refreshes membership, so the My Savings / My Loans tiles appear at once.
export default function useServerNotifications(intervalMs = 30000) {
  const [items, setItems] = useState([]);
  const { isConnected } = useNetworkStatus();
  const connectedRef = useRef(isConnected);
  connectedRef.current = isConnected;

  useEffect(() => {
    let alive = true;
    savedNotifications().then((rows) => { if (alive && rows?.length) setItems((cur) => (cur.length ? cur : rows.map(toItem))); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (connectedRef.current === false) return;                     // offline: keep what we have
    try {
      const rows = await listNotifications();
      setItems(rows.map(toItem));
    } catch { /* offline or server unreachable: keep what we have */ }
  }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, intervalMs); return () => clearInterval(t); }, [refresh, intervalMs]);
  useEffect(() => { if (isConnected) refresh(); }, [isConnected, refresh]);
  return { items, refresh };
}