// admin-console/src/pages/MobileVerificationQueue.jsx
// "Mobile Verification Queue" -- backed by api/riderSupport.js.
import React from 'react';
import { listMobileVerificationQueue, resolveMobileVerification } from '../api/riderSupport';
import { useApiResource } from '../hooks/useApiResource';
import ConfirmButton from '../components/ConfirmButton';

export default function MobileVerificationQueue() {
  // AUDIT FIX (found during full-codebase sweep): no error handling at all -- a failed
  // request silently left the queue looking empty ("Nothing pending") with no indication
  // anything went wrong, indistinguishable from a genuinely empty queue.
  const { data: items, loading, error, refresh } = useApiResource(listMobileVerificationQueue, []);

  async function resolve(id, approved) {
    await resolveMobileVerification(id, approved);
    refresh();
  }

  if (loading) return <p>Loading...</p>;
  if (error) return <p role="alert" style={{ color: 'red' }}>Couldn't load the verification queue: {error}</p>;
  if (!items?.length) return <div className="card"><h2>Mobile Verification Queue</h2><p>Nothing pending. 🎉</p></div>;

  return (
    <div>
      <h2>Mobile Verification Queue</h2>
      <table>
        <thead><tr><th>Rider</th><th>Mobile Number</th><th>Submitted</th><th>Action</th></tr></thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.full_name}</td>
              <td>{item.mobile_number}</td>
              <td>{new Date(item.submitted_at).toLocaleString()}</td>
              <td style={{ display: 'flex', gap: 8 }}>
                {/* AUDIT FIX: these fired immediately with no confirmation, unlike every
                    other rider-access-affecting action in the console (Re-lock, PIN
                    Recovery approval, duplicate-plate resolution). */}
                <ConfirmButton label="Approve" confirmMessage={`Approve ${item.full_name}'s mobile number?`}
                  onConfirm={() => resolve(item.id, true)} />
                <ConfirmButton label="Reject" className="secondary" requireReason
                  confirmMessage={`Reject ${item.full_name}'s mobile number verification?`}
                  onConfirm={() => resolve(item.id, false)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
