// admin-console/src/pages/SubscriptionManagement.jsx
/**
 * SubscriptionManagement Page
 * Manage individual rider subscriptions: enable, disable, extend, and prepay adjustments
 */

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getSubscriptionDetails,
  enableSubscription,
  disableSubscription,
  extendSubscription,
  processPrepayCharge,
  refundSubscriptionCharge,
  adjustPrepayBalance,
  getPrepayHistory,
  getSubscriptionAuditLog,
  getRiderProfile
} from '../api/subscriptionManagement';
import ConfirmButton from '../components/ConfirmButton';
import MaskedPhone from '../components/MaskedPhone';

export default function SubscriptionManagement() {
  const [searchParams] = useSearchParams();
  const riderId = searchParams.get('rider_id');

  const [subscription, setSubscription] = useState(null);
  const [riderProfile, setRiderProfile] = useState(null);
  const [prepayHistory, setPrepayHistory] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Form states
  const [disableReason, setDisableReason] = useState('');
  const [extensionDays, setExtensionDays] = useState('30');
  const [prepayAmount, setPrepayAmount] = useState('');
  const [prepayReason, setPrepayReason] = useState('manual_topup');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (riderId) {
      loadData();
    }
  }, [riderId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [subData, profileData, prepayData, auditData] = await Promise.all([
        getSubscriptionDetails(riderId),
        getRiderProfile(riderId),
        getPrepayHistory(riderId),
        getSubscriptionAuditLog(riderId)
      ]);

      setSubscription(subData);
      setRiderProfile(profileData);
      setPrepayHistory(prepayData);
      setAuditLog(auditData);
    } catch (err) {
      setError('Failed to load subscription details: ' + err.message);
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEnable = async () => {
    if (!confirm('Enable this subscription?')) return;
    try {
      await enableSubscription(riderId, adminNotes);
      setSuccessMsg('Subscription enabled successfully');
      loadData();
      setAdminNotes('');
    } catch (err) {
      setError('Failed to enable subscription: ' + err.message);
    }
  };

  const handleDisable = async () => {
    if (!disableReason) {
      alert('Please select a reason for disabling');
      return;
    }
    if (!confirm('Disable this subscription?')) return;
    try {
      await disableSubscription(riderId, disableReason, adminNotes);
      setSuccessMsg('Subscription disabled successfully');
      loadData();
      setDisableReason('');
      setAdminNotes('');
    } catch (err) {
      setError('Failed to disable subscription: ' + err.message);
    }
  };

  const handleExtend = async () => {
    if (!extensionDays || parseInt(extensionDays) <= 0) {
      alert('Please enter valid number of days');
      return;
    }
    if (!confirm(`Extend subscription by ${extensionDays} days?`)) return;
    try {
      await extendSubscription(riderId, parseInt(extensionDays), adminNotes);
      setSuccessMsg('Subscription extended successfully');
      loadData();
      setExtensionDays('30');
      setAdminNotes('');
    } catch (err) {
      setError('Failed to extend subscription: ' + err.message);
    }
  };

  const handleProcessPrepay = async () => {
    if (!prepayAmount || parseFloat(prepayAmount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    if (!confirm(`Charge KSh ${prepayAmount} to this rider?`)) return;
    try {
      await processPrepayCharge(riderId, parseFloat(prepayAmount), adminNotes);
      setSuccessMsg('Prepay charge processed successfully');
      loadData();
      setPrepayAmount('');
      setAdminNotes('');
    } catch (err) {
      setError('Failed to process prepay: ' + err.message);
    }
  };

  const handleRefund = async () => {
    if (!refundAmount || parseFloat(refundAmount) <= 0) {
      alert('Please enter a valid refund amount');
      return;
    }
    if (!refundReason) {
      alert('Please select a refund reason');
      return;
    }
    if (!confirm(`Refund KSh ${refundAmount} to this rider?`)) return;
    try {
      await refundSubscriptionCharge(riderId, parseFloat(refundAmount), refundReason, adminNotes);
      setSuccessMsg('Refund processed successfully');
      loadData();
      setRefundAmount('');
      setRefundReason('');
      setAdminNotes('');
    } catch (err) {
      setError('Failed to process refund: ' + err.message);
    }
  };

  if (loading) return <div className="loading">Loading subscription details...</div>;

  if (!subscription || !riderProfile) {
    return (
      <div className="subscription-management-page">
        <h1>Subscription Management</h1>
        {error && <div className="error-alert">{error}</div>}
        {!error && <div className="empty-state">No subscription data found</div>}
      </div>
    );
  }

  const formatDate = (date) => new Date(date).toLocaleDateString('en-KE');

  return (
    <div className="subscription-management-page">
      <h1>Subscription Management</h1>

      {successMsg && (
        <div className="success-alert">
          {successMsg}
          <button onClick={() => setSuccessMsg(null)}>✕</button>
        </div>
      )}

      {error && (
        <div className="error-alert">
          {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Rider Info Card */}
      <div className="rider-info-card">
        <h2>{riderProfile.full_name}</h2>
        <p>
          <strong>Phone:</strong> <MaskedPhone phone={riderProfile.mobile_number} />
        </p>
        <p>
          <strong>Email:</strong> {riderProfile.email}
        </p>
        <p>
          <strong>Bike:</strong> {riderProfile.bike_plate} ({riderProfile.bike_model})
        </p>
      </div>

      {/* Subscription Info Cards */}
      <div className="info-grid">
        <div className="info-card">
          <h3>Status</h3>
          <p className="info-value">{subscription.status.toUpperCase()}</p>
        </div>
        <div className="info-card">
          <h3>Start Date</h3>
          <p className="info-value">{formatDate(subscription.start_date)}</p>
        </div>
        <div className="info-card">
          <h3>End Date</h3>
          <p className="info-value">{formatDate(subscription.end_date)}</p>
        </div>
        <div className="info-card">
          <h3>Prepay Balance</h3>
          <p className="info-value">KSh {subscription.prepay_balance?.toLocaleString()}</p>
        </div>
        <div className="info-card">
          <h3>Amount Paid</h3>
          <p className="info-value">KSh {subscription.amount_paid?.toLocaleString()}</p>
        </div>
        <div className="info-card">
          <h3>Payment Method</h3>
          <p className="info-value">{subscription.payment_method || 'N/A'}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab ${activeTab === 'management' ? 'active' : ''}`}
          onClick={() => setActiveTab('management')}
        >
          Management
        </button>
        <button
          className={`tab ${activeTab === 'prepay' ? 'active' : ''}`}
          onClick={() => setActiveTab('prepay')}
        >
          Prepay
        </button>
        <button
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          History
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="tab-content">
          <div className="section">
            <h2>Subscription Details</h2>
            <table className="details-table">
              <tbody>
                <tr>
                  <td>Status:</td>
                  <td>{subscription.status}</td>
                </tr>
                <tr>
                  <td>Period:</td>
                  <td>
                    {formatDate(subscription.start_date)} to{' '}
                    {formatDate(subscription.end_date)}
                  </td>
                </tr>
                <tr>
                  <td>Days Remaining:</td>
                  <td>
                    {Math.ceil(
                      (new Date(subscription.end_date) - new Date()) / (1000 * 60 * 60 * 24)
                    )}{' '}
                    days
                  </td>
                </tr>
                <tr>
                  <td>Subscription Type:</td>
                  <td>{subscription.subscription_type || 'Standard'}</td>
                </tr>
                <tr>
                  <td>Last Payment:</td>
                  <td>{subscription.last_payment_date ? formatDate(subscription.last_payment_date) : 'N/A'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Management Tab */}
      {activeTab === 'management' && (
        <div className="tab-content">
          <div className="section">
            <h2>Enable/Disable Subscription</h2>

            {subscription.status === 'active' ? (
              <div className="form-group">
                <h3>Disable Subscription</h3>
                <p>⚠️ This will suspend the rider's active subscription.</p>

                <select
                  value={disableReason}
                  onChange={(e) => setDisableReason(e.target.value)}
                  className="form-control"
                >
                  <option value="">Select reason...</option>
                  <option value="rider_request">Rider Request</option>
                  <option value="non_payment">Non-payment</option>
                  <option value="rule_violation">Rule Violation</option>
                  <option value="account_issue">Account Issue</option>
                  <option value="admin_action">Admin Action</option>
                </select>

                <textarea
                  placeholder="Admin notes (optional)"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  className="form-control"
                  rows={3}
                />

                <button onClick={handleDisable} className="btn btn-danger">
                  Disable Subscription
                </button>
              </div>
            ) : (
              <div className="form-group">
                <h3>Enable Subscription</h3>
                <p>This will re-activate the rider's subscription.</p>

                <textarea
                  placeholder="Admin notes (optional)"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  className="form-control"
                  rows={3}
                />

                <button onClick={handleEnable} className="btn btn-success">
                  Enable Subscription
                </button>
              </div>
            )}
          </div>

          <div className="section">
            <h2>Extend Subscription</h2>
            <div className="form-group">
              <label>Days to Extend:</label>
              <input
                type="number"
                value={extensionDays}
                onChange={(e) => setExtensionDays(e.target.value)}
                className="form-control"
                min="1"
                max="365"
              />

              <textarea
                placeholder="Admin notes (optional)"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                className="form-control"
                rows={3}
              />

              <button onClick={handleExtend} className="btn btn-primary">
                Extend Subscription
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prepay Tab */}
      {activeTab === 'prepay' && (
        <div className="tab-content">
          <div className="section">
            <h2>Process Prepay Charge</h2>
            <div className="form-group">
              <label>Amount (KSh):</label>
              <input
                type="number"
                value={prepayAmount}
                onChange={(e) => setPrepayAmount(e.target.value)}
                className="form-control"
                placeholder="0"
                step="10"
                min="0"
              />

              <textarea
                placeholder="Admin notes (optional)"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                className="form-control"
                rows={3}
              />

              <button onClick={handleProcessPrepay} className="btn btn-primary">
                Process Prepay Charge
              </button>
            </div>
          </div>

          <div className="section">
            <h2>Process Refund</h2>
            <div className="form-group">
              <label>Refund Amount (KSh):</label>
              <input
                type="number"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                className="form-control"
                placeholder="0"
                step="10"
                min="0"
              />

              <label>Reason:</label>
              <select
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="form-control"
              >
                <option value="">Select reason...</option>
                <option value="overcharge">Overcharge</option>
                <option value="duplicate">Duplicate Charge</option>
                <option value="requested">Rider Requested</option>
                <option value="error">System Error</option>
                <option value="other">Other</option>
              </select>

              <textarea
                placeholder="Admin notes (optional)"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                className="form-control"
                rows={3}
              />

              <button onClick={handleRefund} className="btn btn-warning">
                Process Refund
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="tab-content">
          {prepayHistory.length > 0 && (
            <div className="section">
              <h2>Prepay Transaction History</h2>
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Balance</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {prepayHistory.map((tx, idx) => (
                    <tr key={idx}>
                      <td>{formatDate(tx.created_at)}</td>
                      <td>{tx.transaction_type}</td>
                      <td>KSh {tx.amount?.toLocaleString()}</td>
                      <td>KSh {tx.balance?.toLocaleString()}</td>
                      <td>{tx.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {auditLog.length > 0 && (
            <div className="section">
              <h2>Subscription Audit Log</h2>
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Action</th>
                    <th>Details</th>
                    <th>Admin</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((log, idx) => (
                    <tr key={idx}>
                      <td>{formatDate(log.created_at)}</td>
                      <td>{log.action}</td>
                      <td>{log.details || '-'}</td>
                      <td>{log.admin_email || 'System'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {prepayHistory.length === 0 && auditLog.length === 0 && (
            <div className="empty-state">No history records found</div>
          )}
        </div>
      )}

      <style>{`
        .subscription-management-page {
          padding: 20px;
        }

        .rider-info-card {
          background: #e3f2fd;
          border: 1px solid #2196F3;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
        }

        .rider-info-card h2 {
          margin: 0 0 15px 0;
          color: #1976D2;
        }

        .rider-info-card p {
          margin: 8px 0;
          color: #555;
        }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 15px;
          margin: 20px 0;
        }

        .info-card {
          background: #f5f5f5;
          border-radius: 8px;
          padding: 15px;
          text-align: center;
        }

        .info-card h3 {
          margin: 0 0 10px 0;
          font-size: 0.85rem;
          color: #999;
          text-transform: uppercase;
        }

        .info-value {
          margin: 0;
          font-size: 1.3rem;
          font-weight: bold;
          color: #2196F3;
        }

        .tabs {
          display: flex;
          gap: 10px;
          margin: 20px 0;
          border-bottom: 2px solid #eee;
        }

        .tab {
          background: none;
          border: none;
          padding: 12px 20px;
          cursor: pointer;
          font-size: 1rem;
          color: #999;
          border-bottom: 3px solid transparent;
          transition: all 0.3s;
        }

        .tab.active {
          color: #2196F3;
          border-bottom-color: #2196F3;
        }

        .tab:hover {
          color: #2196F3;
        }

        .tab-content {
          padding: 20px 0;
        }

        .section {
          background: white;
          border: 1px solid #eee;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
        }

        .form-control {
          width: 100%;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 1rem;
          margin-bottom: 15px;
        }

        .form-control:focus {
          outline: none;
          border-color: #2196F3;
          box-shadow: 0 0 5px rgba(33, 150, 243, 0.3);
        }

        .btn {
          padding: 12px 24px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 1rem;
          font-weight: 500;
        }

        .btn-primary {
          background: #2196F3;
          color: white;
        }

        .btn-success {
          background: #4CAF50;
          color: white;
        }

        .btn-danger {
          background: #F44336;
          color: white;
        }

        .btn-warning {
          background: #FF9800;
          color: white;
        }

        .btn:hover {
          opacity: 0.9;
        }

        .details-table,
        .history-table {
          width: 100%;
          border-collapse: collapse;
        }

        .details-table tr,
        .history-table tr {
          border-bottom: 1px solid #eee;
        }

        .details-table td,
        .history-table td {
          padding: 12px;
        }

        .details-table tr:hover,
        .history-table tr:hover {
          background: #f9f9f9;
        }

        .history-table thead {
          background: #f5f5f5;
          font-weight: 500;
        }

        .success-alert,
        .error-alert {
          padding: 15px;
          border-radius: 4px;
          margin: 15px 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .success-alert {
          background: #c8e6c9;
          border: 1px solid #4CAF50;
          color: #2e7d32;
        }

        .error-alert {
          background: #ffcdd2;
          border: 1px solid #F44336;
          color: #c62828;
        }

        .success-alert button,
        .error-alert button {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 1.2rem;
          color: inherit;
        }

        .loading {
          text-align: center;
          padding: 40px;
          color: #999;
        }

        .empty-state {
          text-align: center;
          padding: 40px;
          color: #999;
          background: #f5f5f5;
          border-radius: 8px;
        }
      `}</style>
    </div>
  );
}