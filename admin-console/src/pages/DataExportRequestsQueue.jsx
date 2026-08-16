// admin-console/src/pages/DataExportRequestsQueue.jsx
// AUDIT FIX (Admin Console, Bug): previously rendered by RiderAccountSupport.jsx, which
// ignored the page's actual purpose and showed duplicate-plate cases instead. This is
// the real Data Export queue, backed by the PIN-gated request flow the rider app now
// exposes (see backend/app/routers/sb21_data_export.py).
import React from 'react';
import { listDataExportRequests, fulfilDataExportRequest } from '../api/riderSupport';
import { useApiResource } from '../hooks/useApiResource';
import ConfirmButton from '../components/ConfirmButton';
import MaskedPhone from '../components/MaskedPhone';

export default function DataExportRequestsQueue() {
  const { data: requests, loading, error, refresh } = useApiResource(listDataExportRequests, []);

  async function handleFulfil(id) {
    await fulfilDataExportRequest(id); // BR-SB21-006: manual fulfilment on the Super Admin side
    refresh();
  }

  return (
    <div className="page">
      <h1>Data Export Requests Queue</h1>
      <p className="muted">
        Riders confirm their PIN and a reason before submitting these — see the rider app's
        Data Export flow. Delivery window is configurable under Master Data → Trip &amp; Entry Rules.
      </p>
      {loading && <p>Loading…</p>}
      {error && <p role="alert" style={{ color: 'red' }}>Couldn't load requests: {error}</p>}
      <table>
        <thead><tr><th>Rider</th><th>Contact Email</th><th>Reason</th><th>Requested</th><th>Action</th></tr></thead>
        <tbody>
          {(requests || []).map((r) => (
            <tr key={r.id}>
              <td><MaskedPhone value={r.mobile_number} /></td>
              <td>{r.contact_email}</td>
              <td>{r.reason_code}</td>
              <td>{new Date(r.requested_at).toLocaleString()}</td>
              <td>
                <ConfirmButton label="Mark Fulfilled" requireReason
                  confirmMessage="Confirm this rider's data export has been prepared and sent."
                  onConfirm={() => handleFulfil(r.id)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && (requests || []).length === 0 && <p className="muted">No pending export requests. 🎉</p>}
    </div>
  );
}
