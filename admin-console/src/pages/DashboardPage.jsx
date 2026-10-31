// admin-console/src/pages/DashboardPage.jsx
// Main Stats Dashboard -- rider and group statistics only, backed by
// GET /admin/dashboard/summary (backend/app/routers/admin_dashboard.py).
// Payments, subscriptions, reporting and revenue data were removed along with their menus.
import React, { useEffect, useState } from 'react';
import api from '../api/client';

function StatCard({ label, value, tone }) {
  return (
    <div className="card" style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color: tone || 'var(--ink)' }}>{value}</div>
    </div>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    api.get('/admin/dashboard/summary')
      .then((res) => { if (isMounted) setSummary(res.data); })
      .catch(() => { if (isMounted) setError('Could not load dashboard summary.'); })
      .finally(() => { if (isMounted) setLoading(false); });
    return () => { isMounted = false; };
  }, []);

  if (loading) return <p>Loading dashboard...</p>;
  if (error) return <p style={{ color: 'var(--boda-orange)' }}>{error}</p>;

  return (
    <div>
      <h2>Main Stats Dashboard</h2>
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label="Total Riders" value={summary.total_riders ?? 0} />
        <StatCard label="Active Riders" value={summary.active_riders ?? 0} tone="var(--boda-orange)" />
        <StatCard label="Individual Riders" value={summary.individual_riders ?? 0} tone="#1e9e6f" />
        <StatCard label="Groups" value={summary.total_groups ?? 0} tone="#1976d2" />
      </div>
    </div>
  );
}
