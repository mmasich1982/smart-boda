// admin-console/src/pages/UserEngagementMetrics.jsx
// "User Engagement Metrics" -- backed by GET /admin/reports/engagement. Uses trip-logging
// frequency as the primary signal (see docs/USAGE_STATISTICS_REPORT.md -- the highest
// -frequency, highest-priority functionality in the whole app).
import React from 'react';
import api from '../api/client';
import { useApiResource } from '../hooks/useApiResource';

function MetricCard({ label, value, sub }) {
  return (
    <div className="card" style={{ flex: 1 }}>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function UserEngagementMetrics() {
  // AUDIT FIX (found during full-codebase sweep): same missing-error-handling crash as
  // ChurnAnalysis.jsx -- a failed request left data=null while loading flipped to false.
  const { data, loading, error } = useApiResource(() => api.get('/admin/reports/engagement').then((res) => res.data), []);

  if (loading) return <p>Loading...</p>;
  if (error) return <p role="alert" style={{ color: 'red' }}>Couldn't load engagement metrics: {error}</p>;

  return (
    <div>
      <h2>User Engagement Metrics</h2>
      <div style={{ display: 'flex', gap: 16 }}>
        <MetricCard label="Trips Logged (7 days)" value={data.trips_last_7_days} />
        <MetricCard label="Riders With ≥1 Trip (7 days)" value={data.riders_with_at_least_one_trip_last_7_days} />
        <MetricCard label="Avg Trips / Active Rider" value={data.avg_trips_per_active_rider_last_7_days} />
        <MetricCard
          label="% Active Riders Engaged"
          value={`${data.pct_active_riders_engaged_last_7_days}%`}
          sub={data.pct_active_riders_engaged_last_7_days < 50 ? '⚠️ Below 50% -- worth investigating' : '✅ Healthy'}
        />
      </div>
      <p style={{ marginTop: 20, fontSize: 13, color: 'var(--ink-soft)' }}>
        This starts with trip-logging as the core engagement signal since it's the
        highest-frequency action in the app (8-25x/day per rider). Extend
        <code> app_usage_event</code> logging (see docs/USAGE_STATISTICS_REPORT.md, Section 4)
        to add per-screen engagement once the mobile app is instrumented.
      </p>
    </div>
  );
}
