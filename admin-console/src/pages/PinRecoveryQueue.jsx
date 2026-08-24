// admin-console/src/pages/PinRecoveryQueue.jsx
/**
 * PIN RECOVERY QUEUE - COMPLETE ADMIN CONSOLE (RA-01-E Admin)
 * ✅ ENHANCED: Full PIN recovery management with rider profile view
 * 
 * Features:
 * - Incoming queue of PIN recovery requests
 * - Rider profile details (phone, names, email, bike plate)
 * - Last 3 transactions for due diligence
 * - Admin verification workflow
 * - Email dispatch of new PIN
 * - Dynamic journey extensible to OTP stage in Phase 2
 */

import React, { useState, useEffect } from 'react';
import { listPinRecoveryQueue, approvePinRecovery, getRiderProfile, sendPinByEmail } from '../api/riderSupport';
import { useApiResource } from '../hooks/useApiResource';
import ConfirmButton from '../components/ConfirmButton';
import MaskedPhone from '../components/MaskedPhone';
import './PinRecoveryQueue.css';

export default function PinRecoveryQueue() {
  const { data: items, loading, error, refresh } = useApiResource(listPinRecoveryQueue, []);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [riderProfile, setRiderProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [pinSending, setPinSending] = useState(false);
  const [verificationNotes, setVerificationNotes] = useState('');

  // Fetch rider profile when request is selected
  useEffect(() => {
    if (selectedRequest?.rider_id) {
      loadRiderProfile(selectedRequest.rider_id);
    }
  }, [selectedRequest]);

  async function loadRiderProfile(riderId) {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const profile = await getRiderProfile(riderId);
      setRiderProfile(profile);
    } catch (err) {
      setProfileError(`Failed to load rider profile: ${err.message}`);
    } finally {
      setProfileLoading(false);
    }
  }

  async function handleSendPin(requestId, riderId, email) {
    if (!verificationNotes.trim()) {
      alert('Please enter verification notes before sending PIN');
      return;
    }

    if (!window.confirm(`Send new PIN to ${email}? Make sure you've completed due diligence checks.`)) {
      return;
    }

    setPinSending(true);
    try {
      const response = await sendPinByEmail(requestId, riderId, email, verificationNotes);
      if (response.success) {
        alert('✅ PIN sent successfully! Rider will receive it at ' + email);
        setSelectedRequest(null);
        setRiderProfile(null);
        setVerificationNotes('');
        refresh();
      } else {
        alert('❌ Failed to send PIN: ' + (response.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error sending PIN: ' + err.message);
    } finally {
      setPinSending(false);
    }
  }

  if (loading && !items?.length) {
    return (
      <div className="page-container">
        <h2>PIN Recovery Queue</h2>
        <p className="loading">Loading requests...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <h2>PIN Recovery Queue</h2>
        <p role="alert" className="error-message">
          Couldn't load the queue: {error}
        </p>
      </div>
    );
  }

  if (!items?.length) {
    return (
      <div className="page-container">
        <div className="card">
          <h2>PIN Recovery Queue</h2>
          <p className="empty-state">🎉 No pending PIN recovery requests at this time.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="header">
        <h2>🔐 PIN Recovery Queue</h2>
        <div className="badge-info">{items.length} request(s) pending</div>
      </div>

      <div className="content-grid">
        {/* LEFT: QUEUE LIST */}
        <div className="queue-section">
          <h3>Incoming Requests</h3>
          <div className="queue-list">
            {items.map((item) => (
              <div
                key={item.id}
                className={`queue-item ${selectedRequest?.id === item.id ? 'selected' : ''}`}
                onClick={() => setSelectedRequest(item)}
                role="button"
                tabIndex={0}
              >
                <div className="queue-item-header">
                  <div className="rider-name">{item.full_name || 'Unknown Rider'}</div>
                  <div className="request-time">
                    {new Date(item.requested_at).toLocaleDateString()} {new Date(item.requested_at).toLocaleTimeString()}
                  </div>
                </div>
                <div className="queue-item-details">
                  <span className="email-badge">📧 {item.email || 'No email'}</span>
                  <span className="status-badge">Pending Review</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: PROFILE & ACTIONS */}
        <div className="profile-section">
          {selectedRequest ? (
            <div className="profile-card">
              <h3>Rider Profile & Due Diligence</h3>

              {profileLoading && <p className="loading">Loading rider profile...</p>}
              {profileError && <p className="error-message">{profileError}</p>}

              {riderProfile && (
                <>
                  {/* RIDER DETAILS */}
                  <div className="profile-group">
                    <h4>📋 Rider Information</h4>
                    <div className="profile-row">
                      <label>Full Name:</label>
                      <span>{riderProfile.full_name || 'N/A'}</span>
                    </div>
                    <div className="profile-row">
                      <label>Mobile Number:</label>
                      <span>
                        {riderProfile.mobile_number ? (
                          <MaskedPhone value={riderProfile.mobile_number} />
                        ) : (
                          'N/A'
                        )}
                      </span>
                    </div>
                    <div className="profile-row">
                      <label>Email Address:</label>
                      <span>{riderProfile.email || 'N/A'}</span>
                    </div>
                    <div className="profile-row">
                      <label>Rider ID:</label>
                      <span className="mono">{riderProfile.rider_id}</span>
                    </div>
                  </div>

                  {/* BIKE DETAILS */}
                  <div className="profile-group">
                    <h4>🏍️ Bike Information</h4>
                    <div className="profile-row">
                      <label>Plate Number:</label>
                      <span className="plate-number">{riderProfile.bike_plate || 'N/A'}</span>
                    </div>
                    <div className="profile-row">
                      <label>Bike Model:</label>
                      <span>{riderProfile.bike_model || 'N/A'}</span>
                    </div>
                    <div className="profile-row">
                      <label>Registration Status:</label>
                      <span className="badge-success">✓ {riderProfile.registration_status || 'Active'}</span>
                    </div>
                  </div>

                  {/* RECENT TRANSACTIONS (Due Diligence) */}
                  <div className="profile-group">
                    <h4>💰 Last 3 Transactions (Due Diligence)</h4>
                    {riderProfile.recent_trips && riderProfile.recent_trips.length > 0 ? (
                      <div className="transactions-table">
                        <table>
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Amount (KSh)</th>
                              <th>Method</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {riderProfile.recent_trips.slice(0, 3).map((trip, idx) => (
                              <tr key={idx}>
                                <td>{new Date(trip.completed_at).toLocaleDateString()}</td>
                                <td className="amount">{trip.fare_amount || 0}</td>
                                <td>{trip.payment_method || 'N/A'}</td>
                                <td>
                                  <span className="badge-completed">✓ {trip.status}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="empty-state-small">No recent transactions found</p>
                    )}
                  </div>

                  {/* VERIFICATION NOTES */}
                  <div className="profile-group">
                    <h4>🔍 Verification Notes</h4>
                    <p className="help-text">
                      Document your due diligence findings before sending PIN. This helps with audit and compliance.
                    </p>
                    <textarea
                      className="verification-notes"
                      placeholder="e.g., Verified against last 3 transactions: confirmed match. Identity verified via phone call on [date]. Account status: Active and good standing."
                      value={verificationNotes}
                      onChange={(e) => setVerificationNotes(e.target.value)}
                      disabled={pinSending}
                      rows={4}
                    />
                  </div>

                  {/* ACTION: SEND PIN */}
                  <div className="action-group">
                    <button
                      className="btn-primary"
                      onClick={() => handleSendPin(
                        selectedRequest.id,
                        selectedRequest.rider_id,
                        selectedRequest.email
                      )}
                      disabled={!verificationNotes.trim() || pinSending}
                    >
                      {pinSending ? '⏳ Sending PIN...' : '✉️ Send New PIN via Email →'}
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        setSelectedRequest(null);
                        setRiderProfile(null);
                        setVerificationNotes('');
                      }}
                      disabled={pinSending}
                    >
                      Cancel
                    </button>
                  </div>

                  {/* AUDIT TRAIL */}
                  <div className="audit-info">
                    <p>
                      📝 <strong>Note:</strong> All PIN resets are logged for audit purposes. The rider will receive
                      an email at <strong>{selectedRequest.email}</strong> with instructions to set up their new PIN.
                    </p>
                  </div>

                  {/* PHASE 2 NOTE */}
                  <div className="future-phase-note">
                    <p>
                      💡 <strong>Phase 2 (Future):</strong> This workflow will support OTP verification sent to the rider's
                      registered mobile number without requiring an app update. The journey can be extended dynamically
                      based on rider's account status.
                    </p>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="profile-card empty">
              <p>👈 Select a rider from the queue to view their profile and process the PIN recovery request.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}