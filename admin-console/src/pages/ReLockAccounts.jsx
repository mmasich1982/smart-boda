// admin-console/src/pages/ReLockAccounts.jsx
// "Re-lock Accounts" -- lets an admin manually re-lock an account (e.g. a chargeback, a
// fraudulent M-Pesa code found after the fact). Super-admin only (see App.jsx routing).
// Backed by GET /admin/riders/subscription-status + PATCH /admin/payments/{riderId}/relock.
import React, { useState } from 'react';
import api from '../api/client';
import { useApiResource } from '../hooks/useApiResource';
import ConfirmButton from '../components/ConfirmButton';
import MaskedPhone from '../components/MaskedPhone';

export default function ReLockAccounts() {
  const { data, loading, error, refresh } = useApiResource(
    () => api.get('/admin/riders/subscription-status').then((res) => res.data.items.filter((r) => r.status !== 'expired')),
    []
  );
  const [reasonDrafts, setReasonDrafts] = useState({});

  async function relock(riderId, reason) {
    // AUDIT FIX: re-locking an account now requires an explicit confirmation + reason
    // (via ConfirmButton) instead of firing immediately on click.
    await api.patch(`/admin/payments/${riderId}/relock`, null, {
      params: { reason: reason || reasonDrafts[riderId] || 'Manual re-lock by admin' },
    });
    refresh();
  }

  if (loading) return <p>Loading riders...</p>;

  return (
    <div>
      <h2>Re-lock Accounts</h2>
      <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
        Use this to manually lock a currently-unlocked account -- e.g. a reversed M-Pesa
        transaction or a code that later turns out to be fraudulent.
      </p>
      {error && <p role="alert" style={{ color: 'red' }}>Couldn't load riders: {error}</p>}
      <table>
        <thead><tr><th>Rider</th><th>Phone</th><th>Status</th><th>Reason for re-lock</th><th>Action</th></tr></thead>
        <tbody>
          {(data || []).map((r) => (
            <tr key={r.rider_id}>
              <td>{r.full_name}</td>
              <td><MaskedPhone value={r.mobile_number} /></td>
              <td>{r.status}</td>
              <td>
                <label htmlFor={`relock-reason-${r.rider_id}`} className="sr-only">Reason for re-lock</label>
                <input
                  id={`relock-reason-${r.rider_id}`}
                  style={{ width: '100%', padding: 6 }}
                  placeholder="Reason (optional draft, confirm dialog will ask again)"
                  value={reasonDrafts[r.rider_id] || ''}
                  onChange={(e) => setReasonDrafts((d) => ({ ...d, [r.rider_id]: e.target.value }))}
                />
              </td>
              <td>
                <ConfirmButton
                  label="Re-lock"
                  confirmMessage={`Re-lock ${r.full_name}'s account? They will immediately lose access until manually unlocked.`}
                  onConfirm={() => relock(r.rider_id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
