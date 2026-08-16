// admin-console/src/pages/ComplianceAndSavingsMasterData.jsx
// Master data management for Compliance (License/Insurance types) and Savings (Types/Frequencies)
// All dropdown values are maintained here and fetched from the backend by rider and admin apps

import React, { useEffect, useState } from 'react';
import {
  listDocumentTypes,
  createDocumentType,
  updateDocumentType,
  deleteDocumentType,
  listSavingsTypes,
  createSavingsType,
  updateSavingsType,
  deleteSavingsType,
  listSavingsFrequencies,
  createSavingsFrequency,
  updateSavingsFrequency,
  deleteSavingsFrequency,
} from '../api/masterData';
import { cacheMasterData, readCachedMasterData } from '../api/offlineCache';

export default function ComplianceAndSavingsMasterData() {
  const [activeTab, setActiveTab] = useState('documents');
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Document Types State
  const [documentTypes, setDocumentTypes] = useState([]);
  const [newDocCode, setNewDocCode] = useState('');
  const [newDocName, setNewDocName] = useState('');
  const [newDocDesc, setNewDocDesc] = useState('');
  const [newDocExpiry, setNewDocExpiry] = useState(true);

  // Savings Types State
  const [savingsTypes, setSavingsTypes] = useState([]);
  const [newSavingsCode, setNewSavingsCode] = useState('');
  const [newSavingsName, setNewSavingsName] = useState('');
  const [newSavingsDesc, setNewSavingsDesc] = useState('');

  // Savings Frequencies State
  const [savingsFrequencies, setSavingsFrequencies] = useState([]);
  const [newFreqCode, setNewFreqCode] = useState('');
  const [newFreqName, setNewFreqName] = useState('');
  const [newFreqDesc, setNewFreqDesc] = useState('');

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setError('');

    try {
      const [docs, savings, freqs] = await Promise.all([
        listDocumentTypes(),
        listSavingsTypes(),
        listSavingsFrequencies(),
      ]);

      setDocumentTypes(docs);
      setSavingsTypes(savings);
      setSavingsFrequencies(freqs);
      setOffline(false);

      // Cache for offline access
      cacheMasterData('documentTypes', docs);
      cacheMasterData('savingsTypes', savings);
      cacheMasterData('savingsFrequencies', freqs);
    } catch (err) {
      try {
        const [cachedDocs, cachedSavings, cachedFreqs] = await Promise.all([
          readCachedMasterData('documentTypes'),
          readCachedMasterData('savingsTypes'),
          readCachedMasterData('savingsFrequencies'),
        ]);

        if (cachedDocs || cachedSavings || cachedFreqs) {
          setDocumentTypes(cachedDocs || []);
          setSavingsTypes(cachedSavings || []);
          setSavingsFrequencies(cachedFreqs || []);
          setOffline(true);
        } else {
          setError(err?.response?.data?.detail || err.message || 'Failed to load master data');
        }
      } catch (cacheErr) {
        setError(err?.response?.data?.detail || err.message || 'Failed to load master data');
      }
    } finally {
      setLoading(false);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DOCUMENT TYPES HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  async function handleAddDocumentType() {
    if (!newDocCode || !newDocName) {
      setError('Document type code and name are required');
      return;
    }
    try {
      await createDocumentType(newDocCode, newDocName, newDocDesc, newDocExpiry);
      setNewDocCode('');
      setNewDocName('');
      setNewDocDesc('');
      setNewDocExpiry(true);
      refresh();
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to create document type');
    }
  }

  async function handleUpdateDocType(id, patch) {
    try {
      await updateDocumentType(id, patch);
      refresh();
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to update document type');
    }
  }

  async function handleDeleteDocType(id) {
    if (!window.confirm('Are you sure you want to delete this document type?')) return;
    try {
      await deleteDocumentType(id);
      refresh();
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to delete document type');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SAVINGS TYPES HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  async function handleAddSavingsType() {
    if (!newSavingsCode || !newSavingsName) {
      setError('Savings type code and name are required');
      return;
    }
    try {
      await createSavingsType(newSavingsCode, newSavingsName, newSavingsDesc);
      setNewSavingsCode('');
      setNewSavingsName('');
      setNewSavingsDesc('');
      refresh();
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to create savings type');
    }
  }

  async function handleUpdateSavingsType(id, patch) {
    try {
      await updateSavingsType(id, patch);
      refresh();
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to update savings type');
    }
  }

  async function handleDeleteSavingsType(id) {
    if (!window.confirm('Are you sure you want to delete this savings type?')) return;
    try {
      await deleteSavingsType(id);
      refresh();
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to delete savings type');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SAVINGS FREQUENCIES HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  async function handleAddSavingsFrequency() {
    if (!newFreqCode || !newFreqName) {
      setError('Frequency code and name are required');
      return;
    }
    try {
      await createSavingsFrequency(newFreqCode, newFreqName, newFreqDesc);
      setNewFreqCode('');
      setNewFreqName('');
      setNewFreqDesc('');
      refresh();
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to create frequency');
    }
  }

  async function handleUpdateFrequency(id, patch) {
    try {
      await updateSavingsFrequency(id, patch);
      refresh();
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to update frequency');
    }
  }

  async function handleDeleteFrequency(id) {
    if (!window.confirm('Are you sure you want to delete this frequency?')) return;
    try {
      await deleteSavingsFrequency(id);
      refresh();
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to delete frequency');
    }
  }

  return (
    <div className="page">
      <h1>Compliance & Savings Master Data</h1>

      {error && (
        <p
          role="alert"
          style={{
            color: 'red',
            background: '#ffe6e6',
            padding: 12,
            borderRadius: 6,
            marginBottom: 16,
          }}
        >
          ❌ Error: {error}
        </p>
      )}

      {offline && (
        <p
          role="status"
          style={{
            background: '#fff3cd',
            padding: 8,
            borderRadius: 6,
            marginBottom: 16,
          }}
        >
          ⚠️ Showing last-known values — couldn't reach the server. Changes are disabled until reconnected.
        </p>
      )}

      {loading && <p>Loading master data...</p>}

      {!loading && (
        <>
          <p className="muted">
            All dropdown values for Compliance (documents) and Savings features are maintained here.
            Changes appear in the Rider App immediately on next sync.
          </p>

          {/* TAB NAVIGATION */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              borderBottom: '1px solid #e0e0e0',
              marginBottom: '24px',
            }}
          >
            <button
              onClick={() => setActiveTab('documents')}
              style={{
                padding: '12px 16px',
                background: activeTab === 'documents' ? '#ff7a1a' : 'transparent',
                color: activeTab === 'documents' ? '#fff' : '#333',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                borderBottom: activeTab === 'documents' ? '3px solid #ff7a1a' : 'none',
              }}
            >
              📄 Document Types (License, Insurance)
            </button>
            <button
              onClick={() => setActiveTab('savings-types')}
              style={{
                padding: '12px 16px',
                background: activeTab === 'savings-types' ? '#ff7a1a' : 'transparent',
                color: activeTab === 'savings-types' ? '#fff' : '#333',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                borderBottom: activeTab === 'savings-types' ? '3px solid #ff7a1a' : 'none',
              }}
            >
              💰 Savings Types (SACCO, Chama)
            </button>
            <button
              onClick={() => setActiveTab('frequencies')}
              style={{
                padding: '12px 16px',
                background: activeTab === 'frequencies' ? '#ff7a1a' : 'transparent',
                color: activeTab === 'frequencies' ? '#fff' : '#333',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                borderBottom: activeTab === 'frequencies' ? '3px solid #ff7a1a' : 'none',
              }}
            >
              ⏱️ Frequencies (Daily, Weekly, Monthly)
            </button>
          </div>

          {/* DOCUMENT TYPES TAB */}
          {activeTab === 'documents' && (
            <section>
              <h2>Compliance Document Types</h2>
              <p className="muted">
                Manage document types that riders can submit for compliance (e.g., License, Insurance).
              </p>

              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Requires Expiry</th>
                    <th>Active</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documentTypes.map((doc) => (
                    <tr key={doc.id}>
                      <td>{doc.code}</td>
                      <td>{doc.name}</td>
                      <td>{doc.description || '—'}</td>
                      <td>{doc.requires_expiry ? '✅ Yes' : '❌ No'}</td>
                      <td>
                        <input
                          type="checkbox"
                          checked={doc.is_active !== false}
                          onChange={(e) =>
                            handleUpdateDocType(doc.id, { is_active: e.target.checked })
                          }
                          disabled={offline}
                        />
                      </td>
                      <td>
                        <button
                          onClick={() => handleDeleteDocType(doc.id)}
                          disabled={offline || doc.is_default}
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                        >
                          {doc.is_default ? '🔒 Default' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="add-row">
                <input
                  placeholder="code (e.g., license)"
                  value={newDocCode}
                  onChange={(e) => setNewDocCode(e.target.value)}
                  disabled={offline}
                />
                <input
                  placeholder="name (e.g., License)"
                  value={newDocName}
                  onChange={(e) => setNewDocName(e.target.value)}
                  disabled={offline}
                />
                <input
                  placeholder="description (optional)"
                  value={newDocDesc}
                  onChange={(e) => setNewDocDesc(e.target.value)}
                  disabled={offline}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={newDocExpiry}
                    onChange={(e) => setNewDocExpiry(e.target.checked)}
                    disabled={offline}
                  />
                  Requires Expiry
                </label>
                <button onClick={handleAddDocumentType} disabled={offline}>
                  + Add Document Type
                </button>
              </div>
            </section>
          )}

          {/* SAVINGS TYPES TAB */}
          {activeTab === 'savings-types' && (
            <section>
              <h2>Savings Account Types</h2>
              <p className="muted">
                Manage types of savings accounts riders can create (e.g., SACCO, Chama). These options appear in the Savings Hub.
              </p>

              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Active</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {savingsTypes.map((type) => (
                    <tr key={type.id}>
                      <td>{type.code}</td>
                      <td>{type.name}</td>
                      <td>{type.description || '—'}</td>
                      <td>
                        <input
                          type="checkbox"
                          checked={type.is_active !== false}
                          onChange={(e) =>
                            handleUpdateSavingsType(type.id, { is_active: e.target.checked })
                          }
                          disabled={offline}
                        />
                      </td>
                      <td>
                        <button
                          onClick={() => handleDeleteSavingsType(type.id)}
                          disabled={offline || type.is_default}
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                        >
                          {type.is_default ? '🔒 Default' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="add-row">
                <input
                  placeholder="code (e.g., sacco)"
                  value={newSavingsCode}
                  onChange={(e) => setNewSavingsCode(e.target.value)}
                  disabled={offline}
                />
                <input
                  placeholder="name (e.g., SACCO)"
                  value={newSavingsName}
                  onChange={(e) => setNewSavingsName(e.target.value)}
                  disabled={offline}
                />
                <input
                  placeholder="description (optional)"
                  value={newSavingsDesc}
                  onChange={(e) => setNewSavingsDesc(e.target.value)}
                  disabled={offline}
                />
                <button onClick={handleAddSavingsType} disabled={offline}>
                  + Add Savings Type
                </button>
              </div>
            </section>
          )}

          {/* FREQUENCIES TAB */}
          {activeTab === 'frequencies' && (
            <section>
              <h2>Savings Contribution Frequencies</h2>
              <p className="muted">
                Manage how often riders can contribute to savings (e.g., Daily, Weekly, Monthly).
              </p>

              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Active</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {savingsFrequencies.map((freq) => (
                    <tr key={freq.id}>
                      <td>{freq.code}</td>
                      <td>{freq.name}</td>
                      <td>{freq.description || '—'}</td>
                      <td>
                        <input
                          type="checkbox"
                          checked={freq.is_active !== false}
                          onChange={(e) =>
                            handleUpdateFrequency(freq.id, { is_active: e.target.checked })
                          }
                          disabled={offline}
                        />
                      </td>
                      <td>
                        <button
                          onClick={() => handleDeleteFrequency(freq.id)}
                          disabled={offline || freq.is_default}
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                        >
                          {freq.is_default ? '🔒 Default' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="add-row">
                <input
                  placeholder="code (e.g., weekly)"
                  value={newFreqCode}
                  onChange={(e) => setNewFreqCode(e.target.value)}
                  disabled={offline}
                />
                <input
                  placeholder="name (e.g., Weekly)"
                  value={newFreqName}
                  onChange={(e) => setNewFreqName(e.target.value)}
                  disabled={offline}
                />
                <input
                  placeholder="description (optional)"
                  value={newFreqDesc}
                  onChange={(e) => setNewFreqDesc(e.target.value)}
                  disabled={offline}
                />
                <button onClick={handleAddSavingsFrequency} disabled={offline}>
                  + Add Frequency
                </button>
              </div>
            </section>
          )}

          <div
            style={{
              marginTop: '24px',
              padding: '12px',
              background: '#e6f5ef',
              borderRadius: '6px',
              borderLeft: '3px solid #1e9e6f',
            }}
          >
            <strong>ℹ️ Note:</strong> All values are fetched by the rider app from the API on startup.
            Default types (🔒) cannot be edited or deleted to ensure app stability. Changes are synced immediately.
          </div>
        </>
      )}
    </div>
  );
}