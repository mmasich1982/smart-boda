// admin-console/src/pages/IncomingGroupMemberAdditions.jsx
// Slot requests: a Treasurer whose group reached its approved member limit asks for more slots.
// Approving raises the group's approved_slots on the server and notifies the Treasurer;
// declining needs a reason, which the Treasurer sees.
import React, { useState } from 'react';
import { listSlotRequests, approveSlotRequest, declineSlotRequest } from '../api/groups';
import { useApiResource } from '../hooks/useApiResource';
import ConfirmButton from '../components/ConfirmButton';
import Pagination from '../components/Pagination';

const whyFailed = (e) => {
  const d = e?.response?.data?.detail;      // a string for our errors, a LIST for a 422
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg).replace(/^Value error,\s*/, '');
  return e?.message || 'Something went wrong.';
};

export default function IncomingGroupMemberAdditions() {
  const { data, loading, error, refresh } = useApiResource(() => listSlotRequests('pending'), []);
  const [actionError, setActionError] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Another admin may have decided the request first (the server answers 409). Show the reason
  // and reload the list instead of letting the rejection go unhandled.
  async function act(fn) {
    setActionError(null);
    try { await fn(); }
    catch (e) { setActionError(whyFailed(e)); }
    finally { refresh(); }
  }

  const allRows = data || [];
  // The slot-requests endpoint returns the whole pending queue as a plain list, so it is paged here.
  const totalPages = Math.max(1, Math.ceil(allRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);           // a request decided elsewhere can empty the last page
  // Headline numbers for the pending queue, worked out from the list already loaded.
  const extraSlots = allRows.reduce((n, r) => n + (Number(r.requested_slots) || 0), 0);
  const groupsWaiting = new Set(allRows.map((r) => r.group_id)).size;
  const oldest = allRows.reduce((m, r) => { const t = r.requested_at ? new Date(r.requested_at).getTime() : NaN; return Number.isNaN(t) ? m : Math.min(m, t); }, Infinity);
  const oldestDays = Number.isFinite(oldest) ? Math.max(0, Math.floor((Date.now() - oldest) / 86400000)) : null;
  const ready = !loading && !error;
  const card = (t, v) => <div className="card" style={{ flex: 1, minWidth: 140 }}><div className="muted" style={{ fontSize: 12 }}>{t}</div><div style={{ fontSize: 26, fontWeight: 700 }}>{v ?? '—'}</div></div>;
  const rows = allRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  return (
    <div className="page">
      <h1>Incoming Group Member Additions</h1>
      <p className="muted">Treasurers whose groups reached their approved member limit ask for more slots here.</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        {card('Pending requests', ready ? allRows.length : null)}{card('Extra slots requested', ready ? extraSlots : null)}
        {card('Groups waiting', ready ? groupsWaiting : null)}{card('Oldest request (days)', ready && allRows.length ? oldestDays : null)}
      </div>
      {loading && <p>Loading…</p>}
      {error && <p role="alert" style={{ color: 'red' }}>Couldn't load requests: {error}</p>}
      {actionError && <p role="alert" style={{ color: 'red' }}>Couldn't complete that: {actionError}</p>}
      {rows.map((r) => (
        <div className="case-card card" key={r.id} style={{ marginBottom: 12 }}>
          <h3>{r.group_name} · {r.group_code}</h3>
          <p>Stage: {r.stage_name} · Treasurer: {r.treasurer_name}<br />
            Slots now: {r.slots_used} used of {r.current_slots} · <b>Requesting +{r.requested_slots}</b><br />
            Reason: “{r.reason}”</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <ConfirmButton label={`Approve +${r.requested_slots}`}
              confirmMessage={`Approve ${r.requested_slots} extra slots for ${r.group_name}? The Treasurer is told immediately.`}
              onConfirm={() => act(() => approveSlotRequest(r.id, r.requested_slots, null))} />
            <ConfirmButton label="Decline" className="secondary" requireReason
              confirmMessage="Decline this request? The Treasurer will see your reason (at least 5 characters)."
              onConfirm={(reason) => act(() => declineSlotRequest(r.id, reason))} />
          </div>
        </div>))}
      {!loading && !error && allRows.length === 0 && <p className="muted">No pending requests. 🎉</p>}
      {allRows.length > 0 && (
        <Pagination page={currentPage} pageSize={pageSize} total={allRows.length} disabled={loading}
          onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} pageSizes={[5, 10, 20, 50]} />
      )}
    </div>
  );
}
