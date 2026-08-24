// admin-console/src/pages/PaymentReconciliation.jsx
// PATCH /admin/payments/{id}/reconcile flow for Super Admin manual M-Pesa verification.
import React from 'react';
import api from '../api/client';
import { useApiResource } from '../hooks/useApiResource';
import { currentAdminName } from '../auth/session';
import ConfirmButton from '../components/ConfirmButton';

export default function PaymentReconciliation() {
  // AUDIT FIX (Admin Console, Data Contract): GET /admin/payments always returns the
  // paginated envelope { items, page, total_pages, total } -- this page previously
  // treated the raw response as a bare array (`setPending(data)`), so the reconciliation
  // queue silently rendered nothing useful. Reads `.items` now, same as PaymentHistory.jsx.
  const { data, loading, error, refresh } = useApiResource(
    () => api.get('/admin/payments', { params: { status: 'pending_verification' } }).then((res) => res.data.items),
    []
  );

  async function reconcile(paymentId, approved) {
    await api.patch(`/admin/payments/${paymentId}/reconcile`, { approved, admin_name: currentAdminName() });
    refresh();
  }

  if (loading) return <p>Loading pending payments...</p>;

  return (
    <div>
      <h2>Reconciliation Queue</h2>
      {error && <p role="alert" style={{ color: 'red' }}>Couldn't load pending payments: {error}</p>}
      <table>
        <thead>
          <tr>
            <th>Rider</th><th>M-Pesa Code</th><th>Amount</th><th>Submitted</th><th>Action</th>
          </tr>
        </thead>
        <tbody>
          {(data || []).map((p) => (
            <tr key={p.id}>
              <td>{p.rider_name}</td>
              <td>{p.mpesa_code}</td>
              <td>KSh {p.amount.toLocaleString()}</td>
              <td>{new Date(p.submitted_at).toLocaleString()}</td>
              <td style={{ display: 'flex', gap: 8 }}>
                <ConfirmButton label="Approve" confirmMessage={`Confirm M-Pesa code ${p.mpesa_code} matches a real statement entry?`}
                  onConfirm={() => reconcile(p.id, true)} />
                <ConfirmButton label="Reject" className="secondary" requireReason
                  confirmMessage={`Reject M-Pesa code ${p.mpesa_code}? The rider's payment will show as not found.`}
                  onConfirm={() => reconcile(p.id, false)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && (data || []).length === 0 && <p className="muted">No pending payments to reconcile. 🎉</p>}
    </div>
  );
}
