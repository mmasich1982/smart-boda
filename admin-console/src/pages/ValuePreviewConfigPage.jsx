// admin-console/src/pages/ValuePreviewConfigPage.jsx
import React, { useEffect, useState } from 'react';
import {
  listLanguages,
  listValuePreviewConfigs,
  updateValuePreviewConfig,
} from '../api/masterData';

// Issue 4 & 5 fix: Admin page to manage illustrative value preview figures
export default function ValuePreviewConfigPage() {
  const [configs, setConfigs] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingConfig, setEditingConfig] = useState(null);
  const [earnings, setEarnings] = useState('');
  const [costs, setCosts] = useState('');

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [configsData, languagesData] = await Promise.all([
        listValuePreviewConfigs(),
        listLanguages(),
      ]);
      setConfigs(configsData);
      setLanguages(languagesData);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(config) {
    setEditingConfig(config);
    setEarnings(config.sample_weekly_earnings_ksh);
    setCosts(config.sample_weekly_costs_ksh);
  }

  async function handleSave() {
    if (!editingConfig || !earnings || !costs) {
      setError('Please fill in all fields');
      return;
    }

    try {
      await updateValuePreviewConfig(editingConfig.language_code, {
        sample_weekly_earnings_ksh: parseFloat(earnings),
        sample_weekly_costs_ksh: parseFloat(costs),
        sample_cost_breakdown: editingConfig.sample_cost_breakdown_json,
      });
      setEditingConfig(null);
      refresh();
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to update');
    }
  }

  function handleCancel() {
    setEditingConfig(null);
    setEarnings('');
    setCosts('');
  }

  const getLanguageName = (code) => {
    const lang = languages.find((l) => l.code === code);
    return lang ? lang.display_name : code;
  };

  return (
    <div className="page">
      <h1>Value Preview Configuration</h1>
      <p className="muted">
        Configure the illustrative earnings/costs figures shown to new riders on the Value Preview screen.
      </p>

      {error && (
        <p role="alert" style={{ color: 'red', background: '#ffe6e6', padding: 12, borderRadius: 6, marginBottom: 16 }}>
          ❌ Error: {error}
        </p>
      )}

      {loading && <p>Loading configuration...</p>}

      {!loading && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ccc' }}>
              <th style={{ textAlign: 'left', padding: '12px' }}>Language</th>
              <th style={{ textAlign: 'left', padding: '12px' }}>Weekly Earnings (KSh)</th>
              <th style={{ textAlign: 'left', padding: '12px' }}>Weekly Costs (KSh)</th>
              <th style={{ textAlign: 'left', padding: '12px' }}>Profit (KSh)</th>
              <th style={{ textAlign: 'left', padding: '12px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {configs.map((config) => (
              <tr key={config.language_code} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '12px' }}>{getLanguageName(config.language_code)}</td>
                <td style={{ padding: '12px' }}>
                  {editingConfig?.language_code === config.language_code ? (
                    <input
                      type="number"
                      value={earnings}
                      onChange={(e) => setEarnings(e.target.value)}
                      style={{ width: '100%', padding: '6px' }}
                    />
                  ) : (
                    config.sample_weekly_earnings_ksh.toLocaleString()
                  )}
                </td>
                <td style={{ padding: '12px' }}>
                  {editingConfig?.language_code === config.language_code ? (
                    <input
                      type="number"
                      value={costs}
                      onChange={(e) => setCosts(e.target.value)}
                      style={{ width: '100%', padding: '6px' }}
                    />
                  ) : (
                    config.sample_weekly_costs_ksh.toLocaleString()
                  )}
                </td>
                <td style={{ padding: '12px' }}>
                  {(config.sample_weekly_earnings_ksh - config.sample_weekly_costs_ksh).toLocaleString()}
                </td>
                <td style={{ padding: '12px' }}>
                  {editingConfig?.language_code === config.language_code ? (
                    <>
                      <button
                        onClick={handleSave}
                        style={{ marginRight: '8px', padding: '6px 12px', background: '#1e9e6f', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancel}
                        style={{ padding: '6px 12px', background: '#ccc', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleEdit(config)}
                      style={{ padding: '6px 12px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}