// admin-console/src/pages/DailyRevenueReport.jsx
// "Daily Revenue Report" -- backed by GET /admin/reports/daily-revenue.
import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../api/client';
import { useApiResource } from '../hooks/useApiResource';

export default function DailyRevenueReport() {
  const [days, setDays] = useState(30);
  // AUDIT FIX (found during full-codebase sweep): no error handling at all -- a failed
  // request silently left the chart empty forever with no indication anything went wrong.
  const { data, loading, error } = useApiResource(
    () => api.get('/admin/reports/daily-revenue', { params: { days } }).then((res) => res.data.items), [days]
  );
  const items = data || [];

  const totalRevenue = items.reduce((sum, i) => sum + i.revenue, 0);
  const totalPayments = items.reduce((sum, i) => sum + i.payment_count, 0);

  return (
    <div>
      <h2>Daily Revenue Report</h2>
      <div style={{ marginBottom: 16 }}>
        {[7, 30, 90].map((d) => (
          <button key={d} className={days === d ? 'primary' : ''} onClick={() => setDays(d)}
            style={{ marginRight: 8, padding: '6px 14px', borderRadius: 8, border: '1px solid var(--line)', background: days === d ? undefined : '#fff' }}>
            Last {d} days
          </button>
        ))}
      </div>
      {error && <p role="alert" style={{ color: 'red' }}>Couldn't load the revenue report: {error}</p>}
      {loading ? <p>Loading...</p> : (
        <>
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            <div className="card" style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Total Revenue</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>KSh {totalRevenue.toLocaleString()}</div>
            </div>
            <div className="card" style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Total Payments</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{totalPayments}</div>
            </div>
          </div>
          <div className="card">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={items}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `KSh ${Number(v).toLocaleString()}`} />
                <Bar dataKey="revenue" fill="var(--boda-orange)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
