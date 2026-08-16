// admin-console/src/pages/SubscriptionReports.jsx
/**
 * SubscriptionReports Page
 * Revenue, churn, growth, and prepay analytics
 */

import React, { useState, useEffect } from 'react';
import {
  getRevenueReport,
  getChurnReport,
  getGrowthReport,
  getPrepayReport,
  getCohortAnalysis,
  getLtvAnalysis,
  getFailingPaymentsReport,
  exportSubscriptionReport
} from '../api/subscriptionManagement';

export default function SubscriptionReports() {
  const [activeReport, setActiveReport] = useState('revenue');
  const [period, setPeriod] = useState('30d');
  const [breakdown, setBreakdown] = useState('daily');

  const [revenueReport, setRevenueReport] = useState(null);
  const [churnReport, setChurnReport] = useState(null);
  const [growthReport, setGrowthReport] = useState(null);
  const [prepayReport, setPrepayReport] = useState(null);
  const [cohortAnalysis, setCohortAnalysis] = useState(null);
  const [ltvAnalysis, setLtvAnalysis] = useState(null);
  const [failingPayments, setFailingPayments] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadReports();
  }, [period, breakdown, activeReport]);

  const loadReports = async () => {
    setLoading(true);
    setError(null);
    try {
      switch (activeReport) {
        case 'revenue':
          const revData = await getRevenueReport(period, breakdown);
          setRevenueReport(revData);
          break;
        case 'churn':
          const churnData = await getChurnReport(period);
          setChurnReport(churnData);
          break;
        case 'growth':
          const growthData = await getGrowthReport(period);
          setGrowthReport(growthData);
          break;
        case 'prepay':
          const prepayData = await getPrepayReport(period);
          setPrepayReport(prepayData);
          break;
        case 'cohort':
          const cohortData = await getCohortAnalysis('signup_month');
          setCohortAnalysis(cohortData);
          break;
        case 'ltv':
          const ltvData = await getLtvAnalysis();
          setLtvAnalysis(ltvData);
          break;
        case 'failing':
          const failingData = await getFailingPaymentsReport('failed');
          setFailingPayments(failingData);
          break;
        default:
          break;
      }
    } catch (err) {
      setError(err.message);
      console.error('Error loading reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (reportType) => {
    try {
      await exportSubscriptionReport('csv', reportType, period);
      alert(`${reportType} report exported successfully`);
    } catch (err) {
      alert('Export failed: ' + err.message);
    }
  };

  const formatCurrency = (value) => `KSh ${value?.toLocaleString() || 0}`;
  const formatPercent = (value) => `${value?.toFixed(2) || 0}%`;

  return (
    <div className="subscription-reports-page">
      <h1>Subscription Reports & Analytics</h1>

      {/* Report Navigation */}
      <div className="report-nav">
        <button
          className={`report-btn ${activeReport === 'revenue' ? 'active' : ''}`}
          onClick={() => setActiveReport('revenue')}
        >
          💰 Revenue
        </button>
        <button
          className={`report-btn ${activeReport === 'churn' ? 'active' : ''}`}
          onClick={() => setActiveReport('churn')}
        >
          📉 Churn
        </button>
        <button
          className={`report-btn ${activeReport === 'growth' ? 'active' : ''}`}
          onClick={() => setActiveReport('growth')}
        >
          📈 Growth
        </button>
        <button
          className={`report-btn ${activeReport === 'prepay' ? 'active' : ''}`}
          onClick={() => setActiveReport('prepay')}
        >
          💳 Prepay
        </button>
        <button
          className={`report-btn ${activeReport === 'cohort' ? 'active' : ''}`}
          onClick={() => setActiveReport('cohort')}
        >
          👥 Cohort
        </button>
        <button
          className={`report-btn ${activeReport === 'ltv' ? 'active' : ''}`}
          onClick={() => setActiveReport('ltv')}
        >
          💎 LTV
        </button>
        <button
          className={`report-btn ${activeReport === 'failing' ? 'active' : ''}`}
          onClick={() => setActiveReport('failing')}
        >
          ⚠️ Failing Payments
        </button>
      </div>

      {/* Period & Breakdown Filters */}
      {activeReport !== 'ltv' && activeReport !== 'cohort' && activeReport !== 'failing' && (
        <div className="filters">
          <div className="filter-group">
            <label>Period:</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="365d">Last 365 days</option>
            </select>
          </div>

          {(activeReport === 'revenue' || activeReport === 'growth') && (
            <div className="filter-group">
              <label>Breakdown:</label>
              <select value={breakdown} onChange={(e) => setBreakdown(e.target.value)}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          )}

          <button
            className="export-btn"
            onClick={() => handleExport(activeReport)}
            disabled={loading}
          >
            📥 Export CSV
          </button>
        </div>
      )}

      {error && <div className="error-alert">{error}</div>}

      {loading && <div className="loading">Loading report data...</div>}

      {/* Revenue Report */}
      {activeReport === 'revenue' && revenueReport && !loading && (
        <div className="report-section">
          <h2>Revenue Report</h2>
          <div className="kpi-grid">
            <div className="kpi-card">
              <h3>Total Revenue</h3>
              <p className="kpi-value">{formatCurrency(revenueReport.total_revenue)}</p>
              <p className="kpi-change">
                {revenueReport.revenue_change > 0 ? '↑' : '↓'}{' '}
                {Math.abs(revenueReport.revenue_change)?.toFixed(2)}%
              </p>
            </div>
            <div className="kpi-card">
              <h3>Average Revenue</h3>
              <p className="kpi-value">{formatCurrency(revenueReport.avg_revenue)}</p>
            </div>
            <div className="kpi-card">
              <h3>Peak Revenue Day</h3>
              <p className="kpi-value">{formatCurrency(revenueReport.peak_revenue)}</p>
            </div>
            <div className="kpi-card">
              <h3>MRR</h3>
              <p className="kpi-value">{formatCurrency(revenueReport.mrr)}</p>
            </div>
          </div>

          {revenueReport.breakdown && (
            <div className="data-table">
              <h3>Revenue Breakdown ({breakdown})</h3>
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Revenue</th>
                    <th>Transactions</th>
                    <th>Avg Transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueReport.breakdown.map((row, idx) => (
                    <tr key={idx}>
                      <td>{row.period}</td>
                      <td>{formatCurrency(row.revenue)}</td>
                      <td>{row.transactions}</td>
                      <td>{formatCurrency(row.avg_transaction)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Churn Report */}
      {activeReport === 'churn' && churnReport && !loading && (
        <div className="report-section">
          <h2>Churn Analysis</h2>
          <div className="kpi-grid">
            <div className="kpi-card">
              <h3>Total Churned</h3>
              <p className="kpi-value">{churnReport.total_churned || 0}</p>
            </div>
            <div className="kpi-card">
              <h3>Churn Rate</h3>
              <p className="kpi-value">{formatPercent(churnReport.churn_rate)}</p>
            </div>
            <div className="kpi-card">
              <h3>Retention Rate</h3>
              <p className="kpi-value">{formatPercent(churnReport.retention_rate)}</p>
            </div>
          </div>

          {churnReport.reasons && Object.keys(churnReport.reasons).length > 0 && (
            <div className="data-table">
              <h3>Churn Reasons</h3>
              <table>
                <thead>
                  <tr>
                    <th>Reason</th>
                    <th>Count</th>
                    <th>Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(churnReport.reasons).map(([reason, count], idx) => (
                    <tr key={idx}>
                      <td>{reason}</td>
                      <td>{count}</td>
                      <td>
                        {formatPercent(
                          (count / churnReport.total_churned) * 100
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Growth Report */}
      {activeReport === 'growth' && growthReport && !loading && (
        <div className="report-section">
          <h2>Growth Report</h2>
          <div className="kpi-grid">
            <div className="kpi-card">
              <h3>New Subscribers</h3>
              <p className="kpi-value">{growthReport.new_subscribers || 0}</p>
            </div>
            <div className="kpi-card">
              <h3>Net Growth</h3>
              <p className="kpi-value">{growthReport.net_growth || 0}</p>
            </div>
            <div className="kpi-card">
              <h3>Growth Rate</h3>
              <p className="kpi-value">{formatPercent(growthReport.growth_rate)}</p>
            </div>
            <div className="kpi-card">
              <h3>Total Active</h3>
              <p className="kpi-value">{growthReport.total_active || 0}</p>
            </div>
          </div>

          {growthReport.daily_growth && (
            <div className="data-table">
              <h3>Daily Growth Trend</h3>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>New Subs</th>
                    <th>Churned</th>
                    <th>Net Change</th>
                  </tr>
                </thead>
                <tbody>
                  {growthReport.daily_growth.map((row, idx) => (
                    <tr key={idx}>
                      <td>{row.date}</td>
                      <td>{row.new_subscribers}</td>
                      <td>{row.churned}</td>
                      <td className={row.net_change >= 0 ? 'positive' : 'negative'}>
                        {row.net_change >= 0 ? '+' : ''}{row.net_change}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Prepay Report */}
      {activeReport === 'prepay' && prepayReport && !loading && (
        <div className="report-section">
          <h2>Prepay Report</h2>
          <div className="kpi-grid">
            <div className="kpi-card">
              <h3>Total Prepay Collected</h3>
              <p className="kpi-value">{formatCurrency(prepayReport.total_prepay)}</p>
            </div>
            <div className="kpi-card">
              <h3>Average Prepay Balance</h3>
              <p className="kpi-value">
                {formatCurrency(prepayReport.avg_prepay_balance)}
              </p>
            </div>
            <div className="kpi-card">
              <h3>Total Transactions</h3>
              <p className="kpi-value">{prepayReport.total_transactions || 0}</p>
            </div>
            <div className="kpi-card">
              <h3>Avg Transaction Value</h3>
              <p className="kpi-value">
                {formatCurrency(prepayReport.avg_transaction_value)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Cohort Analysis */}
      {activeReport === 'cohort' && cohortAnalysis && !loading && (
        <div className="report-section">
          <h2>Cohort Analysis (by Signup Month)</h2>
          {cohortAnalysis.cohorts && (
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>Cohort</th>
                    <th>Size</th>
                    <th>Month 1 Retention</th>
                    <th>Month 2 Retention</th>
                    <th>Month 3 Retention</th>
                    <th>Avg Lifetime Value</th>
                  </tr>
                </thead>
                <tbody>
                  {cohortAnalysis.cohorts.map((cohort, idx) => (
                    <tr key={idx}>
                      <td>{cohort.cohort}</td>
                      <td>{cohort.size}</td>
                      <td>{formatPercent(cohort.retention_m1)}</td>
                      <td>{formatPercent(cohort.retention_m2)}</td>
                      <td>{formatPercent(cohort.retention_m3)}</td>
                      <td>{formatCurrency(cohort.avg_ltv)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* LTV Analysis */}
      {activeReport === 'ltv' && ltvAnalysis && !loading && (
        <div className="report-section">
          <h2>Lifetime Value Analysis</h2>
          <div className="kpi-grid">
            <div className="kpi-card">
              <h3>Overall LTV</h3>
              <p className="kpi-value">{formatCurrency(ltvAnalysis.overall_ltv)}</p>
            </div>
            <div className="kpi-card">
              <h3>Median LTV</h3>
              <p className="kpi-value">{formatCurrency(ltvAnalysis.median_ltv)}</p>
            </div>
            <div className="kpi-card">
              <h3>Top 10% LTV</h3>
              <p className="kpi-value">{formatCurrency(ltvAnalysis.top_10_ltv)}</p>
            </div>
          </div>

          {ltvAnalysis.by_segment && (
            <div className="data-table">
              <h3>LTV by Segment</h3>
              <table>
                <thead>
                  <tr>
                    <th>Segment</th>
                    <th>Subscribers</th>
                    <th>Avg LTV</th>
                    <th>Total LTV</th>
                  </tr>
                </thead>
                <tbody>
                  {ltvAnalysis.by_segment.map((seg, idx) => (
                    <tr key={idx}>
                      <td>{seg.segment}</td>
                      <td>{seg.count}</td>
                      <td>{formatCurrency(seg.avg_ltv)}</td>
                      <td>{formatCurrency(seg.total_ltv)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Failing Payments */}
      {activeReport === 'failing' && failingPayments && !loading && (
        <div className="report-section">
          <h2>Failing Payments Alert</h2>
          {failingPayments.length > 0 ? (
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>Rider</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Last Attempt</th>
                    <th>Retry Count</th>
                  </tr>
                </thead>
                <tbody>
                  {failingPayments.map((payment, idx) => (
                    <tr key={idx}>
                      <td>{payment.rider_name}</td>
                      <td>{formatCurrency(payment.amount)}</td>
                      <td>
                        <span className="status-badge warning">{payment.status}</span>
                      </td>
                      <td>
                        {new Date(payment.last_attempt).toLocaleDateString('en-KE')}
                      </td>
                      <td>{payment.retry_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">All payments are processing successfully!</div>
          )}
        </div>
      )}

      <style>{`
        .subscription-reports-page {
          padding: 20px;
        }

        .report-nav {
          display: flex;
          gap: 10px;
          margin: 20px 0;
          flex-wrap: wrap;
        }

        .report-btn {
          background: white;
          border: 2px solid #ddd;
          padding: 12px 20px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.3s;
        }

        .report-btn.active {
          background: #2196F3;
          color: white;
          border-color: #2196F3;
        }

        .report-btn:hover {
          border-color: #2196F3;
        }

        .filters {
          display: flex;
          gap: 15px;
          margin: 20px 0;
          background: #f5f5f5;
          padding: 15px;
          border-radius: 8px;
          flex-wrap: wrap;
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

        .filter-group select {
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }

        .export-btn {
          background: #4CAF50;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
          align-self: flex-end;
        }

        .export-btn:hover:not(:disabled) {
          opacity: 0.9;
        }

        .export-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .report-section {
          margin: 30px 0;
        }

        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin: 20px 0;
        }

        .kpi-card {
          background: white;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 20px;
          text-align: center;
        }

        .kpi-card h3 {
          margin: 0 0 15px 0;
          color: #666;
          font-size: 0.9rem;
          text-transform: uppercase;
        }

        .kpi-value {
          margin: 0 0 10px 0;
          font-size: 2rem;
          font-weight: bold;
          color: #2196F3;
        }

        .kpi-change {
          margin: 0;
          font-size: 0.9rem;
          color: #999;
        }

        .data-table {
          background: white;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
          overflow-x: auto;
        }

        .data-table h3 {
          margin-top: 0;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        th {
          background: #f5f5f5;
          padding: 12px;
          text-align: left;
          font-weight: 500;
          border-bottom: 2px solid #ddd;
        }

        td {
          padding: 12px;
          border-bottom: 1px solid #eee;
        }

        tr:hover {
          background: #f9f9f9;
        }

        .positive {
          color: #4CAF50;
          font-weight: bold;
        }

        .negative {
          color: #F44336;
          font-weight: bold;
        }

        .status-badge {
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 500;
        }

        .status-badge.warning {
          background: #fff3cd;
          color: #856404;
        }

        .error-alert {
          background: #ffcdd2;
          border: 1px solid #F44336;
          color: #c62828;
          padding: 15px;
          border-radius: 4px;
          margin: 15px 0;
        }

        .loading {
          text-align: center;
          padding: 40px;
          color: #999;
        }

        .empty-state {
          text-align: center;
          padding: 40px;
          background: #f5f5f5;
          border-radius: 8px;
          color: #999;
        }
      `}</style>
    </div>
  );
}