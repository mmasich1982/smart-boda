// admin-console/src/pages/ActiveRidersList.jsx
// "Active Riders List" -- backed by GET /admin/riders?status=active, with headline numbers from
// GET /admin/riders/stats.
import React, { useState } from 'react';
import api from '../api/client';
import { changeVehicleType } from '../api/individualRiders';     // SMART CABZ
import { currentAdminRole } from '../auth/session';
import { useApiResource } from '../hooks/useApiResource';

export default function ActiveRidersList() {
  // SMART CABZ: a Super Admin changes a person's vehicle type (motorcycle -> Smart Boda, car -> Smart Cabz); the server logs it with the reason
  async function change(r) {
    const to = r.vehicle_type === 'car' ? 'motorcycle' : 'car';
    if (!window.confirm(`Change ${r.full_name} to a ${to === 'car' ? 'car driver (Smart Cabz)' : 'motorcycle rider (Smart Boda)'}?`)) return;
    const reason = window.prompt('Reason for the change (at least 5 characters)') || '';
    if (reason.trim().length < 5) return;
    try { await changeVehicleType(r.id, to, reason.trim()); window.alert('Done. Their phone switches the next time it is online.'); window.location.reload(); }
    catch (e) { const d = e?.response?.data?.detail; window.alert(typeof d === 'string' ? d : 'Could not change the vehicle type.'); }
  }
  const [page, setPage] = useState(1);
  // AUDIT FIX (found during full-codebase sweep): no error handling at all -- a failed
  // request silently left the table empty forever with no indication anything went wrong.
  const { data, loading, error } = useApiResource(
    () => api.get('/admin/riders', { params: { status: 'active', page, page_size: 25 } }).then((res) => res.data),
    [page]
  );
  const stats = useApiResource(() => api.get('/admin/riders/stats').then((res) => res.data), []);
  const st = stats.data || {};
  const card = (t, v) => <div className="card" style={{ flex: 1, minWidth: 140 }}><div className="muted" style={{ fontSize: 12 }}>{t}</div><div style={{ fontSize: 26, fontWeight: 700 }}>{v ?? '—'}</div></div>;
  const items = data?.items || [];
  const totalPages = data?.total_pages || 1;

  return (
    <div>
      <h2>Active Riders</h2>
      {stats.error && <p role="alert" style={{ color: 'red' }}>Couldn't load rider statistics: {stats.error}</p>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        {card('Active riders', st.active_riders)}{card('Total riders', st.total_riders)}{card('Not yet active', st.not_yet_active_riders)}
        {card('Joined last 7 days', st.active_joined_last_7_days)}{card('Joined last 30 days', st.active_joined_last_30_days)}
      </div>
      {error && <p role="alert" style={{ color: 'red' }}>Couldn't load active riders: {error}</p>}
      {loading ? <p>Loading...</p> : (
        <>
          <table>
            <thead><tr><th>Name</th><th>Mobile</th><th>Type</th><th>Joined</th><th>Actions</th></tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td>{r.full_name}</td>
                  <td>{r.mobile_number}</td>
                  <td>{r.kind === 'business' ? '🏪 Business user' : r.vehicle_type === 'car' ? '🚗 Car driver' : '🏍️ Motorcycle rider'}</td>
                  <td>{new Date(r.created_at).toLocaleDateString()}</td>
                  <td>{currentAdminRole() === 'super_admin' && r.kind !== 'business'
                    ? <button className="secondary" onClick={() => change(r)}>Change vehicle type</button> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <span>Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </>
      )}
    </div>
  );
}
