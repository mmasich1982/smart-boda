import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './OutOfWindowCorrectionQueue.css';

/**
 * OutOfWindowCorrectionQueue Component
 * Admin page for reviewing and processing out-of-window correction requests
 * Implements RA-04-D spec: Out-of-Window Correction Management
 */

export default function OutOfWindowCorrectionQueue() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending'); // pending, approved, rejected
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [approvalNote, setApprovalNote] = useState('');
  const [actionInProgress, setActionInProgress] = useState(false);

  useEffect(() => {
    fetchRequests();
  }, [filter]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `/api/v1/admin/out-of-window-corrections?status=${filter}`
      );
      setRequests(response.data.data || []);
    } catch (error) {
      console.error('Error fetching requests:', error);
      alert('Error loading correction requests');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetail = (request) => {
    setSelectedRequest(request);
    setShowDetailModal(true);
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;

    try {
      setActionInProgress(true);
      await axios.post(
        `/api/v1/admin/out-of-window-corrections/${selectedRequest.id}/approve`,
        {
          admin_notes: approvalNote,
          approved_amount: selectedRequest.requested_amount,
        }
      );
      alert('Correction request approved');
      setShowDetailModal(false);
      setApprovalNote('');
      fetchRequests();
    } catch (error) {
      console.error('Error approving request:', error);
      alert('Error approving correction request');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest || !approvalNote) {
      alert('Please provide a reason for rejection');
      return;
    }

    try {
      setActionInProgress(true);
      await axios.post(
        `/api/v1/admin/out-of-window-corrections/${selectedRequest.id}/reject`,
        {
          admin_notes: approvalNote,
        }
      );
      alert('Correction request rejected');
      setShowDetailModal(false);
      setApprovalNote('');
      fetchRequests();
    } catch (error) {
      console.error('Error rejecting request:', error);
      alert('Error rejecting correction request');
    } finally {
      setActionInProgress(false);
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'pending':
        return 'badge-pending';
      case 'approved':
        return 'badge-approved';
      case 'rejected':
        return 'badge-rejected';
      default:
        return '';
    }
  };

  return (
    <div className="out-of-window-correction-queue">
      <div className="header">
        <h1>📋 Out-of-Window Correction Queue</h1>
        <p className="subtitle">RA-04-D · Rider requests for corrections beyond 24-hour window</p>
      </div>

      <div className="filters">
        <button
          className={`filter-btn ${filter === 'pending' ? 'active' : ''}`}
          onClick={() => setFilter('pending')}
        >
          Pending
        </button>
        <button
          className={`filter-btn ${filter === 'approved' ? 'active' : ''}`}
          onClick={() => setFilter('approved')}
        >
          Approved
        </button>
        <button
          className={`filter-btn ${filter === 'rejected' ? 'active' : ''}`}
          onClick={() => setFilter('rejected')}
        >
          Rejected
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading correction requests...</div>
      ) : requests.length === 0 ? (
        <div className="no-data">No {filter} correction requests at this time.</div>
      ) : (
        <div className="requests-table">
          <table>
            <thead>
              <tr>
                <th>Rider ID</th>
                <th>Trip Date</th>
                <th>Original Amount (KSh)</th>
                <th>Requested Amount (KSh)</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className="request-row">
                  <td className="rider-id">{request.rider_id}</td>
                  <td>{new Date(request.trip_date).toLocaleDateString()}</td>
                  <td className="original-amount">{request.original_amount.toLocaleString()}</td>
                  <td className="requested-amount">{request.requested_amount.toLocaleString()}</td>
                  <td className="reason">{request.reason}</td>
                  <td>
                    <span className={`badge ${getStatusBadgeClass(request.status)}`}>
                      {request.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="submitted-at">
                    {new Date(request.created_at).toLocaleString()}
                  </td>
                  <td>
                    <button
                      className="view-btn"
                      onClick={() => handleViewDetail(request)}
                      disabled={filter !== 'pending'}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedRequest && (
        <div className="modal-overlay" onClick={() => setShowDetailModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Correction Request Details</h2>
              <button
                className="close-btn"
                onClick={() => setShowDetailModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="detail-section">
                <h3>Rider Information</h3>
                <div className="detail-row">
                  <span className="label">Rider ID:</span>
                  <span className="value">{selectedRequest.rider_id}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Name:</span>
                  <span className="value">{selectedRequest.rider_name}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Mobile:</span>
                  <span className="value">{selectedRequest.rider_phone}</span>
                </div>
              </div>

              <div className="detail-section">
                <h3>Trip Information</h3>
                <div className="detail-row">
                  <span className="label">Trip ID:</span>
                  <span className="value">{selectedRequest.trip_id}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Trip Date:</span>
                  <span className="value">
                    {new Date(selectedRequest.trip_date).toLocaleString()}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="label">Original Amount:</span>
                  <span className="value">KSh {selectedRequest.original_amount.toLocaleString()}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Payment Method:</span>
                  <span className="value">{selectedRequest.payment_method}</span>
                </div>
              </div>

              <div className="detail-section">
                <h3>Correction Request</h3>
                <div className="detail-row">
                  <span className="label">Requested Amount:</span>
                  <span className="value highlight">
                    KSh {selectedRequest.requested_amount.toLocaleString()}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="label">Difference:</span>
                  <span className={`value ${selectedRequest.requested_amount > selectedRequest.original_amount ? 'increase' : 'decrease'}`}>
                    KSh {Math.abs(selectedRequest.requested_amount - selectedRequest.original_amount).toLocaleString()}
                    {selectedRequest.requested_amount > selectedRequest.original_amount ? ' (+)' : ' (-)'}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="label">Reason for Correction:</span>
                  <span className="value">{selectedRequest.reason}</span>
                </div>
              </div>

              <div className="detail-section">
                <h3>Request Metadata</h3>
                <div className="detail-row">
                  <span className="label">Submitted:</span>
                  <span className="value">{new Date(selectedRequest.created_at).toLocaleString()}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Hours Since Trip:</span>
                  <span className="value">
                    {Math.round(
                      (new Date(selectedRequest.created_at) - new Date(selectedRequest.trip_date)) /
                        (1000 * 60 * 60)
                    )}
                    h
                  </span>
                </div>
              </div>

              {selectedRequest.status === 'pending' && (
                <div className="action-section">
                  <label>Admin Notes (required for rejection)</label>
                  <textarea
                    className="admin-notes"
                    value={approvalNote}
                    onChange={(e) => setApprovalNote(e.target.value)}
                    placeholder="Enter decision notes or reason for rejection"
                    rows="4"
                  />
                </div>
              )}
            </div>

            {selectedRequest.status === 'pending' && (
              <div className="modal-footer">
                <button
                  className="btn-approve"
                  onClick={handleApprove}
                  disabled={actionInProgress}
                >
                  ✓ Approve
                </button>
                <button
                  className="btn-reject"
                  onClick={handleReject}
                  disabled={actionInProgress || !approvalNote}
                >
                  ✕ Reject
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}