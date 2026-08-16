// admin-console/src/pages/SubscriptionStatus.jsx
/**
 * SubscriptionStatus Page
 * View all rider subscriptions with status, filters, and quick actions
 */

import React, { useState, useEffect } from 'react';
import {
  listSubscriptions,
  filterSubscriptions,
  searchSubscriptions,
  getSubscriptionStats
} from '../api/subscriptionManagement';
import { useApiResource } from '../hooks/useApiResource';
import ConfirmButton from '../components/ConfirmButton';
import MaskedPhone from '../components/MaskedPhone';

export default function SubscriptionStatus() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [stats, setStats] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [sortBy, setSortBy] = useState('end_date');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch subscriptions and stats on mount and filter changes
  useEffect(() => {
    loadData();
  }, [statusFilter, periodFilter]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch stats
      const statsData = await getSubscriptionStats();
      setStats(statsData);

      // Fetch subscriptions with filters
      let data;
      if (statusFilter === 'all') {
        data = await listSubscriptions();
      } else {
        data = await filterSubscriptions(statusFilter, periodFilter);
      }

      // Apply search if term entered
      if (searchTerm) {
        data = data.filter(
          (sub) =>
            sub.rider_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            sub.rider_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            sub.rider_phone?.includes(searchTerm.toLowerCase())
        );
      }

      // Sort
      data.sort((a, b) => {
        if (sortBy === 'end_date') {
          return new Date(b.end_date) - new Date(a.end_date);
        }
        if (sortBy === 'rider_name') {
          return a.rider_name.localeCompare(b.rider_name);
        }
        return 0;
      });

      setSubscriptions(data);
    } catch (err) {
      setError(err.message);
      console.error('Error loading subscriptions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    const term = e.target.value;
    setSearchTerm(term);
    
    if (!term) {
      loadData();
      return;
    }

    setLoading(true);
    try {
      const results = await searchSubscriptions(term);
      setSubscriptions(results);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return '#4CAF50';
      case 'inactive':
        return '#FF9800';
      case 'expired':
        return '#F44336';
      case 'suspended':
        return '#9C27B0';
      default:
        return '#999';
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-KE');
  };

  const getDaysRemaining = (endDate) => {
    const today = new Date();
    const end = new Date(endDate);
    const days = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
    return days;
  };

  return (
    <div className="subscription-status-page">
      <h1>Subscription Status Dashboard</h1>

      {/* Stats Cards */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <h3>Active Subscribers</h3>
            <p className="stat-value">{stats.active_count || 0}</p>
          </div>
          <div className="stat-card">
            <h3>Total Revenue (30d)</h3>
            <p className="stat-value">KSh {stats.revenue_30d?.toLocaleString() || 0}</p>
          </div>
          <div className="stat-card">
            <h3>Churn Rate</h3>
            <p className="stat-value">{stats.churn_rate?.toFixed(2) || 0}%</p>
          </div>
          <div className="stat-card">
            <h3>MRR</h3>
            <p className="stat-value">KSh {stats.mrr?.toLocaleString() || 0}</p>
          </div>
        </div>
      )}

      {/* Filters and Search */}
      <div className="filters-section">
        <div className="filter-group">
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={searchTerm}
            onChange={handleSearch}
            className="search-input"
          />
        </div>

        <div className="filter-group">
          <label>Status:</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="expired">Expired</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Period:</label>
          <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)}>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Sort by:</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="end_date">End Date (Newest)</option>
            <option value="rider_name">Rider Name</option>
          </select>
        </div>
      </div>

      {/* Error message */}
      {error && <div className="error-alert">{error}</div>}

      {/* Loading state */}
      {loading && <div className="loading">Loading subscriptions...</div>}

      {/* Subscriptions Table */}
      {!loading && subscriptions.length > 0 && (
        <div className="subscriptions-table">
          <table>
            <thead>
              <tr>
                <th>Rider</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Days Remaining</th>
                <th>Prepay Balance</th>
                <th>Amount Paid</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((sub) => (
                <tr key={sub.rider_id}>
                  <td>
                    <strong>{sub.rider_name}</strong>
                    <br />
                    <small>{sub.bike_plate || 'N/A'}</small>
                  </td>
                  <td>
                    <MaskedPhone phone={sub.rider_phone} />
                    <br />
                    <small>{sub.rider_email}</small>
                  </td>
                  <td>
                    <span
                      className="status-badge"
                      style={{ backgroundColor: getStatusColor(sub.status) }}
                    >
                      {sub.status}
                    </span>
                  </td>
                  <td>{formatDate(sub.start_date)}</td>
                  <td>{formatDate(sub.end_date)}</td>
                  <td>
                    <span
                      className={
                        getDaysRemaining(sub.end_date) < 7
                          ? 'days-alert'
                          : 'days-normal'
                      }
                    >
                      {getDaysRemaining(sub.end_date)} days
                    </span>
                  </td>
                  <td>KSh {sub.prepay_balance?.toLocaleString() || 0}</td>
                  <td>KSh {sub.amount_paid?.toLocaleString() || 0}</td>
                  <td>
                    <a href={`/subscription-management?rider_id=${sub.rider_id}`}>
                      Manage →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && subscriptions.length === 0 && (
        <div className="empty-state">
          <p>No subscriptions found matching your criteria.</p>
        </div>
      )}

      <style>{`
        .subscription-status-page {
          padding: 20px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
          margin: 20px 0;
        }

        .stat-card {
          background: #f5f5f5;
          border-radius: 8px;
          padding: 20px;
          text-align: center;
          border-left: 4px solid #2196F3;
        }

        .stat-card h3 {
          margin: 0 0 10px 0;
          font-size: 0.9rem;
          color: #666;
        }

        .stat-value {
          margin: 0;
          font-size: 1.8rem;
          font-weight: bold;
          color: #2196F3;
        }

        .filters-section {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
          margin: 20px 0;
          background: #f9f9f9;
          padding: 15px;
          border-radius: 8px;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .filter-group label {
          font-weight: 500;
          font-size: 0.9rem;
        }

        .search-input,
        .filter-group select {
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 1rem;
        }

        .subscriptions-table {
          overflow-x: auto;
          margin-top: 20px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          background: white;
        }

        th {
          background: #2196F3;
          color: white;
          padding: 12px;
          text-align: left;
          font-weight: 500;
        }

        td {
          padding: 12px;
          border-bottom: 1px solid #eee;
        }

        tr:hover {
          background: #f5f5f5;
        }

        .status-badge {
          padding: 6px 12px;
          border-radius: 20px;
          color: white;
          font-size: 0.85rem;
          font-weight: 500;
        }

        .days-alert {
          color: #F44336;
          font-weight: bold;
        }

        .days-normal {
          color: #4CAF50;
        }

        .error-alert {
          background: #ffebee;
          border: 1px solid #F44336;
          color: #C62828;
          padding: 15px;
          border-radius: 4px;
          margin: 10px 0;
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
        }

        a {
          color: #2196F3;
          text-decoration: none;
          cursor: pointer;
        }

        a:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}