// admin-console/src/pages/DuplicatePlateQueue.jsx
// AUDIT FIX (Admin Console, Bug): this used to be RiderAccountSupport.jsx, which ignored
// its `view` prop entirely and always rendered this same duplicate-plate content --
// meaning /rider-support/data-export showed the exact wrong queue. Split into two real
// components; see DataExportRequestsQueue.jsx for the other half.
import React from 'react';
import { listDuplicatePlateCases, resolveDuplicatePlateCase } from '../api/riderSupport';
import { useApiResource } from '../hooks/useApiResource';
import ConfirmButton from '../components/ConfirmButton';
import MaskedPhone from '../components/MaskedPhone';

export default function DuplicatePlateQueue() {
  const { data: cases, loading, error, refresh } = useApiResource(listDuplicatePlateCases, []);

  async function handleResolve(caseId, decision) {
    // BR-SB02-009: only a human decision can close the case; nothing here auto-suspends anyone
    await resolveDuplicatePlateCase(caseId, decision);
    refresh();
  }

  return (
    <div className="page">
      <h1>Rider Account Support — Duplicate‑Plate Cases</h1>
      {loading && <p>Loading…</p>}
      {error && <p role="alert" style={{ color: 'red' }}>Couldn't load cases: {error}</p>}
      {(cases || []).map((c) => (
        <div className="case-card" key={c.id}>
          <h3>Case {c.id} — Plate {c.number_plate}</h3>
          <p>Rider A: <MaskedPhone value={c.rider_a_masked_phone} /> · registered {c.rider_a_submitted_at}</p>
          <p>Rider B: <MaskedPhone value={c.rider_b_masked_phone} /> · registered {c.rider_b_submitted_at}</p>
          <div className="actions" style={{ display: 'flex', gap: 8 }}>
            <ConfirmButton label="Confirm Rider A" confirmMessage="Confirm Rider A keeps this plate? Rider B will be asked to correct their entry."
              onConfirm={() => handleResolve(c.id, 'confirm_a')} />
            <ConfirmButton label="Confirm Rider B" confirmMessage="Confirm Rider B keeps this plate? Rider A will be asked to correct their entry."
              onConfirm={() => handleResolve(c.id, 'confirm_b')} />
            <ConfirmButton label="Request Correction — Both" className="secondary"
              confirmMessage="Ask both riders to correct their entry?"
              onConfirm={() => handleResolve(c.id, 'request_correction_both')} />
          </div>
        </div>
      ))}
      {!loading && (cases || []).length === 0 && <p className="muted">No open duplicate‑plate cases. 🎉</p>}
    </div>
  );
}
