/**
 * LipaLaterConfig.jsx
 * Admin console page for managing Lipa Later configuration and monitoring
 * 
 * AUDIT FIX: Uses shared `api` client (with withCredentials), proper error handling,
 * native HTML elements instead of non-existent UI component library.
 */

import React, { useEffect, useState } from 'react';
import api from '../api/client';

export const LipaLaterConfig = () => {
  const [config, setConfig] = useState({
    records_per_page: 10,
    scroll_height_px: 500,
    enable_payment_tracking: true,
    enable_ageing_report: true,
  });

  const [summary, setSummary] = useState({
    total_records: 0,
    pending_records: 0,
    paid_records: 0,
    total_amount: 0,
    pending_amount: 0,
  });

  const [riders, setRiders] = useState({});
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [configError, setConfigError] = useState('');
  const [summaryError, setSummaryError] = useState('');

  // Fetch configuration and summary on load
  useEffect(() => {
    fetchConfiguration();
    fetchSummary();
    const interval = setInterval(fetchSummary, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchConfiguration = async () => {
    setConfigLoading(true);
    setConfigError('');
    try {
      const { data } = await api.get('/admin/trips/lipa-later/config');
      setConfig(data);
    } catch (error) {
      setConfigError(error?.response?.data?.detail || error.message || 'Failed to fetch configuration');
    } finally {
      setConfigLoading(false);
    }
  };

  const fetchSummary = async () => {
    setSummaryLoading(true);
    setSummaryError('');
    try {
      const { data } = await api.get('/admin/trips/lipa-later/riders-summary');
      setSummary(data.summary || {});
      setRiders(data.riders || {});
    } catch (error) {
      setSummaryError(error?.response?.data?.detail || error.message || 'Failed to fetch summary');
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleConfigChange = (field, value) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSaveConfig = async () => {
    setLoading(true);
    setMessage('');
    try {
      await api.post('/admin/trips/lipa-later/config', config);
      setMessageType('success');
      setMessage('Configuration saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessageType('error');
      setMessage(error?.response?.data?.detail || error.message || 'Failed to save configuration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 32, fontWeight: 'bold', marginBottom: 12 }}>Lipa Later Management</h1>
        <p style={{ color: 'var(--ink-soft)', marginBottom: 8 }}>Configure payment tracking settings and monitor Lipa Later activity</p>
      </div>

      {message && (
        <div role="alert" style={{
          padding: 16,
          borderRadius: 8,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          backgroundColor: messageType === 'success' ? '#d4edda' : '#f8d7da',
          color: messageType === 'success' ? '#155724' : '#721c24',
          border: `1px solid ${messageType === 'success' ? '#c3e6cb' : '#f5c6cb'}`
        }}>
          <span style={{ fontSize: 20 }}>{messageType === 'success' ? '✅' : '⚠️'}</span>
          <span>{message}</span>
        </div>
      )}

      {configError && (
        <div role="alert" style={{
          padding: 16,
          borderRadius: 8,
          backgroundColor: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          display: 'flex',
          gap: 8,
          alignItems: 'center'
        }}>
          <span style={{ fontSize: 20 }}>❌</span>
          <span>Configuration error: {configError}</span>
        </div>
      )}

      {summaryError && (
        <div role="alert" style={{
          padding: 16,
          borderRadius: 8,
          backgroundColor: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          display: 'flex',
          gap: 8,
          alignItems: 'center'
        }}>
          <span style={{ fontSize: 20 }}>❌</span>
          <span>Summary error: {summaryError}</span>
        </div>
      )}

      {/* Summary Section */}
      <div>
        <h2 style={{ marginBottom: 16, fontWeight: 600, fontSize: 18 }}>Summary</h2>
        {summaryLoading ? (
          <p>Loading summary...</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 8 }}>Total Records</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{summary.total_records || 0}</div>
              <p style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>All Lipa Later entries</p>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 8 }}>Pending</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--boda-orange)' }}>{summary.pending_records || 0}</div>
              <p style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>Awaiting payment</p>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 8 }}>Paid</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#1e9e6f' }}>{summary.paid_records || 0}</div>
              <p style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>Completed</p>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 8 }}>Total Amount</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>KSh {(summary.total_amount || 0).toLocaleString()}</div>
              <p style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>All transactions</p>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 8 }}>Pending Amount</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--boda-orange)' }}>KSh {(summary.pending_amount || 0).toLocaleString()}</div>
              <p style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>Outstanding</p>
            </div>
          </div>
        )}
      </div>

      {/* Configuration Section */}
      <div className="card" style={{ padding: 24 }}>
        <h2 style={{ marginBottom: 24, fontWeight: 600, fontSize: 18, marginTop: 0 }}>Lipa Later Settings</h2>
        <p style={{ color: 'var(--ink-soft)', marginBottom: 24, fontSize: 13 }}>Configure how Lipa Later records are displayed and tracked</p>

        {configLoading ? (
          <p>Loading configuration...</p>
        ) : (
          <>
            <div style={{ marginBottom: 24 }}>
              <label htmlFor="records-per-page" style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 14 }}>Records Per Page</label>
              <input
                id="records-per-page"
                type="number"
                min="5"
                max="50"
                value={config.records_per_page || 10}
                onChange={(e) => handleConfigChange('records_per_page', parseInt(e.target.value))}
                style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--line)' }}
              />
              <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>Number of records displayed per page (5-50)</p>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label htmlFor="scroll-height" style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 14 }}>Scroll Container Height (px)</label>
              <input
                id="scroll-height"
                type="number"
                min="300"
                max="800"
                step="50"
                value={config.scroll_height_px || 500}
                onChange={(e) => handleConfigChange('scroll_height_px', parseInt(e.target.value))}
                style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--line)' }}
              />
              <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>Height of scrollable containers (300-800px)</p>
            </div>

            <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 500, fontSize: 14, marginBottom: 4 }}>Enable Payment Tracking</label>
                <p style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Allow riders to mark payments as received</p>
              </div>
              <input
                type="checkbox"
                checked={config.enable_payment_tracking || false}
                onChange={(e) => handleConfigChange('enable_payment_tracking', e.target.checked)}
                style={{ width: 24, height: 24, cursor: 'pointer' }}
              />
            </div>

            <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 500, fontSize: 14, marginBottom: 4 }}>Enable Ageing Report</label>
                <p style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Show payment ageing analysis (0-30, 31-60, 61-90, 90+ days)</p>
              </div>
              <input
                type="checkbox"
                checked={config.enable_ageing_report || false}
                onChange={(e) => handleConfigChange('enable_ageing_report', e.target.checked)}
                style={{ width: 24, height: 24, cursor: 'pointer' }}
              />
            </div>

            <button
              className="primary"
              onClick={handleSaveConfig}
              disabled={loading}
              style={{ width: '100%', padding: '12px 16px' }}
            >
              {loading ? 'Saving...' : 'Save Configuration'}
            </button>
          </>
        )}
      </div>

      {/* Riders Section */}
      <div className="card" style={{ padding: 24 }}>
        <h2 style={{ marginBottom: 16, fontWeight: 600, fontSize: 18, marginTop: 0 }}>Rider Lipa Later Activity</h2>
        {summaryLoading ? (
          <p>Loading riders...</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13 }}>
              <thead style={{ borderBottom: '1px solid var(--line)', backgroundColor: '#f8f8f8' }}>
                <tr>
                  <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 600 }}>Rider ID</th>
                  <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: 600 }}>Total</th>
                  <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: 600 }}>Pending</th>
                  <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: 600 }}>Paid</th>
                  <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: 600 }}>Total Amount</th>
                  <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: 600 }}>Pending Amount</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(riders).map(([riderId, data]) => (
                  <tr key={riderId} style={{ borderBottom: '1px solid var(--line)', backgroundColor: 'hover' ? '#fafafa' : 'white' }}>
                    <td style={{ padding: '12px 8px', fontFamily: 'monospace', fontSize: 11 }}>{riderId?.substring(0, 8)}...</td>
                    <td style={{ textAlign: 'right', padding: '12px 8px' }}>{data?.total || 0}</td>
                    <td style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--boda-orange)', fontWeight: 600 }}>{data?.pending || 0}</td>
                    <td style={{ textAlign: 'right', padding: '12px 8px', color: '#1e9e6f', fontWeight: 600 }}>{data?.paid || 0}</td>
                    <td style={{ textAlign: 'right', padding: '12px 8px', fontWeight: 600 }}>KSh {(data?.total_amount || 0).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--boda-orange)', fontWeight: 600 }}>KSh {(data?.pending_amount || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {Object.keys(riders).length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--ink-soft)' }}>
                No riders have Lipa Later records yet
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LipaLaterConfig;
