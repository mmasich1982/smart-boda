// admin-console/src/pages/SystemHealth.jsx
// "System Health (API uptime, DB size)" -- backed by GET /health (already existed in
// backend/app/main.py) + GET /admin/reports/system-health for DB size and reconciliation backlog.
import React, { useEffect, useState } from 'react';
import api from '../api/client';

export default function SystemHealth() {
  const [apiStatus, setApiStatus] = useState('checking');
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/health')
      .then(() => setApiStatus('healthy'))
      .catch(() => setApiStatus('unreachable'));
    
    api.get('/admin/reports/system-health')
      .then((res) => setHealth(res.data))
      .catch((err) => setError(err?.response?.data?.detail || err.message || 'Failed to load system health'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h2>System Health</h2>
      {error && <p role="alert" style={{ color: 'red', marginBottom: 16 }}>❌ {error}</p>}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Backend API</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: apiStatus === 'healthy' ? '#1e9e6f' : '#e0453f' }}>
            {apiStatus === 'checking' ? 'Checking…' : apiStatus === 'healthy' ? '✅ Healthy' : '🔴 Unreachable'}
          </div>
        </div>
        {!loading && health && (
          <>
            <div className="card" style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Database Size</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{health.database_size}</div>
            </div>
            <div className="card" style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Pending Reconciliation</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: health.pending_reconciliation_count > 20 ? '#e0453f' : undefined }}>
                {health.pending_reconciliation_count}
              </div>
              {health.oldest_pending_reconciliation_age_hours != null && (
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                  Oldest: {health.oldest_pending_reconciliation_age_hours}h ago
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        For deeper uptime history, wire this page up to an external monitor (e.g. UptimeRobot
        pinging /health every 5 minutes) as described in your deployment roadmap, Part 8.5.
      </p>
    </div>
  );
}
