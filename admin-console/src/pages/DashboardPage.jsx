// admin-console/src/pages/DashboardPage.jsx
// "Top: Rider stats (active, subscribed, locked), Revenue chart" -- backed by
// GET /admin/dashboard/summary (backend/app/routers/admin_dashboard.py).
import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Riders" value={summary.total_riders} />
        <StatCard label="Active Riders" value={summary.active_riders} tone="var(--boda-orange)" />
        <StatCard label="Subscribed" value={summary.subscribed_riders} tone="#1e9e6f" />
        <StatCard label="Locked" value={summary.locked_riders} tone="#e0453f" />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Revenue -- Last 14 Days</h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={summary.revenue_last_14_days}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => `KSh ${Number(v).toLocaleString()}`} />
            <Line type="monotone" dataKey="revenue" stroke="var(--boda-orange)" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
