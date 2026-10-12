// admin-console/src/pages/IncomingGroupMemberAdditions.jsx
import React from 'react';
import { listSlotRequests, approveSlotRequest, declineSlotRequest } from '../api/groups';
import { useApiResource } from '../hooks/useApiResource';
import ConfirmButton from '../components/ConfirmButton';

export default function IncomingGroupMemberAdditions() {
  const { data, loading, error, refresh } = useApiResource(() => listSlotRequests('pending'), []);
  return (
    <div className="page">
      <h1>Incoming Group Member Additions</h1>
      <p className="muted">Treasurers whose groups reached their approved member limit ask for more slots here.</p>
      {loading && <p>Loading…</p>}
      {error && <p role="alert" style={{ color: 'red' }}>Couldn't load requests: {error}</p>}
      {(data || []).map((r) => (
        <div className="case-card card" key={r.id} style={{ marginBottom: 12 }}>
          <h3>{r.group_name} · {r.group_code}</h3>
          <p>Stage: {r.stage_name} · Treasurer: {r.treasurer_name}<br />
            Slots now: {r.slots_used} used of {r.current_slots} · <b>Requesting +{r.requested_slots}</b><br />
            Reason: “{r.reason}”</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <ConfirmButton label={`Approve +${r.requested_slots}`}
              confirmMessage={`Approve ${r.requested_slots} extra slots for ${r.group_name}? The Treasurer is told immediately.`}
              onConfirm={async () => { await approveSlotRequest(r.id, r.requested_slots, null); refresh(); }} />
            <ConfirmButton label="Decline" className="secondary" requireReason
              confirmMessage="Decline this request? The Treasurer will see your reason."
              onConfirm={async (reason) => { await declineSlotRequest(r.id, reason); refresh(); }} />
          </div>
        </div>))}
      {!loading && (data || []).length === 0 && <p className="muted">No pending requests. 🎉</p>}
    </div>
  );
}