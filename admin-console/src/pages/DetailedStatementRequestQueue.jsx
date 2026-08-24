import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './DetailedStatementRequestQueue.css';

/**
 * DetailedStatementRequestQueue Component
 * Admin interface for managing detailed statement requests
 * Implements RA-18-C spec: Detailed Statement Delivery
 * BR-SB20-007: SLA window displayed and enforced
 * BR-SB20-008: Statement history retrieval enabled (no time limit)
 */

export default function DetailedStatementRequestQueue() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending'); // pending, in_progress, completed
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [actionInProgress, setActionInProgress] = useState(false);
  const [sortOrder, setSortOrder] = useState('desc'); // newest first (BR-SB20-008)

  useEffect(() => {
    fetchRequests();
  }, [filter, sortOrder]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `/api/v1/admin/detailed-statement-requests`,
        {
          params: {
            status: filter,
            sort: sortOrder
          }
        }
      );
      setRequests(response.data.data || []);
    } catch (error) {
      console.error('Error fetching requests:', error);
      alert('Error loading detailed statement requests');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetail = (request) => {
    setSelectedRequest(request);
    setAdminNotes(request.admin_notes || '');
    setShowDetailModal(true);
  };

  const handleMarkInProgress = async () => {
    if (!selectedRequest) return;

    try {
      setActionInProgress(true);
      await axios.post(
        `/api/v1/admin/detailed-statement-requests/${selectedRequest.id}/mark-in-progress`,
        {
          admin_notes: adminNotes
        }
      );
      alert('Request marked as in progress');
      setShowDetailModal(false);
      setAdminNotes('');
      fetchRequests();
    } catch (error) {
      console.error('Error updating request:', error);
      alert('Error updating request status');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleMarkCompleted = async () => {
    if (!selectedRequest) return;

    try {
      setActionInProgress(true);
      // RA-18-C: Admin team prepares and emails statement
      await axios.post(
        `/api/v1/admin/detailed-statement-requests/${selectedRequest.id}/mark-completed`,
        {
          admin_notes: adminNotes,
          email_sent_at: new Date().toISOString() // Track when delivery email was sent
        }
      );
      alert('Request marked as completed - Statement delivery email sent');
      setShowDetailModal(false);
      setAdminNotes('');
      fetchRequests();
    } catch (error) {
      console.error('Error completing request:', error);
      alert('Error completing request');
    } finally {
      setActionInProgress(false);
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'pending':
        return 'badge-pending';
      case 'in_progress':
        return 'badge-in-progress';
      case 'completed':
        return 'badge-completed';
      default:
        return '';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'in_progress':
        return 'In Progress';
      case 'completed':
        return 'Completed';
      default:
        return status;
    }
  };

  // BR-SB20-007: Calculate SLA remaining
  const getSlaBadgeClass = (requestedAt, slaHours) => {
    const now = new Date();
    const deadline = new Date(new Date(requestedAt).getTime() + slaHours * 3600 * 1000);
    const hoursRemaining = (deadline - now) / (3600 * 1000);
    
    if (hoursRemaining < 0) return 'sla-exceeded';
    if (hoursRemaining < 4) return 'sla-critical';
    if (hoursRemaining < 12) return 'sla-warning';
    return 'sla-ok';
  };

  return (
    <div className="detailed-statement-queue">
      <div className="header">
        <h1>📋 Detailed Statement Request Queue</h1>
        <p className="subtitle">RA-18-C · Manage detailed statement requests and delivery (BR-SB20-007/008)</p>
      </div>

      <div className="controls">
        <div className="filters">
          <button
            className={`filter-btn ${filter === 'pending' ? 'active' : ''}`}
            onClick={() => setFilter('pending')}
          >
            Pending
          </button>
          <button
            className={`filter-btn ${filter === 'in_progress' ? 'active' : ''}`}
            onClick={() => setFilter('in_progress')}
          >
            In Progress
          </button>
          <button
            className={`filter-btn ${filter === 'completed' ? 'active' : ''}`}
            onClick={() => setFilter('completed')}
          >
            Completed
          </button>
        </div>

        {/* BR-SB20-008: Sort order control */}
        <div className="sort-controls">
          <label>Sort: </label>
          <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
            <option value="desc">Newest First</option>
            <option value="asc">Oldest First</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading detailed statement requests...</div>
      ) : requests.length === 0 ? (
        <div className="no-data">No {filter} detailed statement requests at this time.</div>
      ) : (
        <div className="requests-table">
          <table>
            <thead>
              <tr>
                <th>Rider ID</th>
                <th>Statement Period</th>
                <th>Email</th>
                <th>Requested</th>
                <th>Status</th>
                <th>SLA</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className="request-row">
                  <td className="rider-id">{request.rider_id}</td>
                  <td>
                    {new Date(request.statement.period_start).toLocaleDateString()} –{' '}
                    {new Date(request.statement.period_end).toLocaleDateString()}
                  </td>
                  <td className="email">{request.contact_email || request.email}</td>
                  <td className="requested-at">
                    {new Date(request.requested_at || request.pin_verified_at).toLocaleString()}
                  </td>
                  <td>
                    <span className={`badge ${getStatusBadgeClass(request.status)}`}>
                      {getStatusLabel(request.status)}
                    </span>
                  </td>
                  <td>
                    <span className={`sla-badge ${getSlaBadgeClass(request.requested_at || request.pin_verified_at, request.sla_hours)}`}>
                      {request.sla_hours}h
                    </span>
                  </td>
                  <td>
                    <button
                      className="view-btn"
                      onClick={() => handleViewDetail(request)}
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
              <h2>Detailed Statement Request</h2>
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
                  <span className="label">Verified Email:</span>
                  <span className="value">{selectedRequest.contact_email || selectedRequest.email}</span>
                </div>
              </div>

              <div className="detail-section">
                <h3>Statement Information (BR-SB20-008: Full History)</h3>
                <div className="detail-row">
                  <span className="label">Period:</span>
                  <span className="value">
                    {new Date(selectedRequest.statement.period_start).toLocaleDateString()} –{' '}
                    {new Date(selectedRequest.statement.period_end).toLocaleDateString()}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="label">Purpose:</span>
                  <span className="value">
                    {selectedRequest.statement.purpose_code || 'Not specified'}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="label">Income:</span>
                  <span className="value">
                    KSh {parseFloat(selectedRequest.statement.income).toLocaleString()}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="label">Expense:</span>
                  <span className="value">
                    KSh {parseFloat(selectedRequest.statement.total_expense).toLocaleString()}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="label">Net Profit:</span>
                  <span className="value highlight">
                    KSh {parseFloat(selectedRequest.statement.net_profit).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="detail-section">
                <h3>Request Details (BR-SB20-007: SLA Tracking)</h3>
                <div className="detail-row">
                  <span className="label">PIN Verified At:</span>
                  <span className="value">
                    {new Date(selectedRequest.pin_verified_at || selectedRequest.requested_at).toLocaleString()}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="label">SLA Window:</span>
                  <span className="value">{selectedRequest.sla_hours} hours</span>
                </div>
                <div className="detail-row">
                  <span className="label">Status:</span>
                  <span className={`value badge ${getStatusBadgeClass(selectedRequest.status)}`}>
                    {getStatusLabel(selectedRequest.status)}
                  </span>
                </div>
              </div>

              {selectedRequest.status !== 'completed' && (
                <div className="action-section">
                  <label>Admin Notes</label>
                  <textarea
                    className="admin-notes"
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Add notes about the statement preparation and delivery"
                    rows="4"
                  />
                </div>
              )}

              {selectedRequest.status === 'completed' && selectedRequest.admin_notes && (
                <div className="action-section">
                  <label>Completed Notes</label>
                  <div className="completed-notes">{selectedRequest.admin_notes}</div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              {selectedRequest.status === 'pending' && (
                <button
                  className="btn-in-progress"
                  onClick={handleMarkInProgress}
                  disabled={actionInProgress}
                >
                  Start Processing
                </button>
              )}

              {selectedRequest.status === 'in_progress' && (
                <button
                  className="btn-completed"
                  onClick={handleMarkCompleted}
                  disabled={actionInProgress}
                >
                  Mark Completed & Send Email
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}