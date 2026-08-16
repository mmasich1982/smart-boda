// admin-console/src/pages/ChurnAnalysis.jsx
// "Churn Analysis" -- backed by GET /admin/analytics/churn.
import React from 'react';
import api from '../api/client';
import { useApiResource } from '../hooks/useApiResource';

export default function ChurnAnalysis() {
  // AUDIT FIX (found during full-codebase sweep): this had no .catch() at all -- a failed
  // request left `data` as null while `loading` still flipped to false, so the render below
  // crashed on `data.churn_rate_pct` instead of showing an error. useApiResource handles
  // this consistently, same as the rest of the console.
  const { data, loading, error } = useApiResource(() => api.get('/admin/analytics/churn').then((res) => res.data), []);

  if (loading) return <p>Loading...</p>;
  if (error) return <p role="alert" style={{ color: 'red' }}>Couldn't load churn analysis: {error}</p>;

  return (
    <div>
      <h2>Churn Analysis</h2>
      <div style={{ display: 'flex', gap: 16 }}>
        <div className="card" style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Churn Rate (Last 30 Days)</div>
          <div style={{ fontSize: 34, fontWeight: 800, color: data.churn_rate_pct > 15 ? '#e0453f' : '#1e9e6f' }}>
            {data.churn_rate_pct}%
          </div>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Riders Churned</div>
          <div style={{ fontSize: 34, fontWeight: 800 }}>{data.churned_last_30_days}</div>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Total Ever Paid</div>
          <div style={{ fontSize: 34, fontWeight: 800 }}>{data.total_ever_paid_riders}</div>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Active (Trips, Last 30d)</div>
          <div style={{ fontSize: 34, fontWeight: 800 }}>{data.recently_active_rider_count}</div>
        </div>
      </div>
      <p style={{ marginTop: 20, fontSize: 13, color: 'var(--ink-soft)' }}>
        "Churned" means a rider who paid at least once but is now locked out and has not paid
        again within 30 days. See docs/USAGE_STATISTICS_REPORT.md for how this ties into
        overall engagement tracking.
      </p>
    </div>
  );
}
