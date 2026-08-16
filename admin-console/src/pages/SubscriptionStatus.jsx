// admin-console/src/pages/SubscriptionStatus.jsx
// "Subscription Status (Free Trial / Paid / Expired)" -- backed by
// GET /admin/riders/subscription-status.
import React, { useState } from 'react';
import api from '../api/client';
import { useApiResource } from '../hooks/useApiResource';

const STATUS_LABELS = { free_trial: 'Free Trial', paid: 'Paid', expired: 'Expired' };
const STATUS_COLORS = { free_trial: '#c98a12', paid: '#1e9e6f', expired: '#e0453f' };

export default function SubscriptionStatus() {
  const [filter, setFilter] = useState('all');
  // AUDIT FIX (found during full-codebase sweep): no error handling at all -- a failed
  // request silently left the table empty forever with no indication anything went wrong.
  const { data, loading, error } = useApiResource(
    () => api.get('/admin/riders/subscription-status').then((res) => res.data.items), []
  );
  const items = data || [];

  const filtered = filter === 'all' ? items : items.filter((i) => i.status === filter);
  const counts = items.reduce((acc, i) => ({ ...acc, [i.status]: (acc[i.status] || 0) + 1 }), {});

  if (loading) return <p>Loading...</p>;
  if (error) return <p role="alert" style={{ color: 'red' }}>Couldn't load subscription status: {error}</p>;

  return (
    <div>
      <h2>Subscription Status</h2>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {['all', 'free_trial', 'paid', 'expired'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={filter === s ? 'primary' : ''}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--line)', background: filter === s ? undefined : '#fff' }}
          >
            {s === 'all' ? `All (${items.length})` : `${STATUS_LABELS[s]} (${counts[s] || 0})`}
          </button>
        ))}
      </div>
      <table>
        <thead><tr><th>Rider</th><th>Phone</th><th>Status</th><th>Expiry</th></tr></thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.rider_id}>
              <td>{r.full_name}</td>
              <td>{r.mobile_number}</td>
              <td style={{ color: STATUS_COLORS[r.status], fontWeight: 700 }}>{STATUS_LABELS[r.status]}</td>
              <td>{new Date(r.expiry_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
