// admin-console/src/pages/LegalDocumentsPage.jsx
// Issue 15 fix: Admin can now manage Terms of Service and Data Privacy documents

import React, { useEffect, useState } from 'react';
import { listLegalDocuments, updateLegalDocument } from '../api/masterData';

export default function LegalDocumentsPage() {
  const [documents, setDocuments] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingKey, setEditingKey] = useState(null);
  const [editingContent, setEditingContent] = useState('');
  const [saving, setSaving] = useState(false);

  const DOC_CONFIG = {
    terms_of_service: {
      title: 'Terms of Service',
      description: 'Legal terms governing use of the Smart Boda Digital app',
      placeholder: 'Enter Terms of Service content here...'
    },
    data_privacy_notice: {
      title: 'Data Privacy Notice',
      description: 'Privacy policy explaining how user data is collected, used, and protected',
      placeholder: 'Enter Data Privacy Notice content here...'
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const data = await listLegalDocuments();
      setDocuments(data || {});
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to load legal documents');
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(key) {
    setEditingKey(key);
    setEditingContent(documents[key]?.content || '');
  }

  async function handleSave() {
    if (!editingKey || !editingContent.trim()) {
      setError('Content cannot be empty');
      return;
    }

    try {
      setSaving(true);
      setError('');
      await updateLegalDocument(editingKey, { content: editingContent.trim() });
      await refresh();
      setEditingKey(null);
      setEditingContent('');
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to save document');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setEditingKey(null);
    setEditingContent('');
  }

  return (
    <div className="page">
      <h1>Legal Documents Management</h1>
      <p className="muted">
        Manage Terms of Service and Data Privacy Notice. Changes are reflected in the rider app immediately.
      </p>

      {error && (
        <p role="alert" style={{ color: 'red', background: '#ffe6e6', padding: 12, borderRadius: 6, marginBottom: 16 }}>
          ❌ Error: {error}
        </p>
      )}

      {loading && <p>Loading legal documents...</p>}

      {!loading && (
        <div style={{ display: 'grid', gap: '24px' }}>
          {Object.entries(DOC_CONFIG).map(([key, config]) => (
            <div key={key} style={{ borderRadius: '8px', border: '1px solid #e0e0e0', padding: '16px' }}>
              <div style={{ marginBottom: '12px' }}>
                <h2 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>{config.title}</h2>
                <p style={{ margin: 0, color: '#666', fontSize: '13px' }}>{config.description}</p>
                {documents[key]?.updated_at && (
                  <p style={{ margin: '4px 0 0 0', color: '#999', fontSize: '12px' }}>
                    Last updated: {new Date(documents[key].updated_at).toLocaleString()}
                  </p>
                )}
              </div>

              {editingKey === key ? (
                <div>
                  <textarea
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    placeholder={config.placeholder}
                    style={{
                      width: '100%',
                      minHeight: '300px',
                      padding: '12px',
                      borderRadius: '4px',
                      border: '1px solid #ccc',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      marginBottom: '12px',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      style={{
                        padding: '8px 16px',
                        background: '#1e9e6f',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        opacity: saving ? 0.7 : 1,
                      }}
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={saving}
                      style={{
                        padding: '8px 16px',
                        background: '#ccc',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: saving ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div
                    style={{
                      background: '#f5f5f5',
                      padding: '12px',
                      borderRadius: '4px',
                      maxHeight: '200px',
                      overflow: 'auto',
                      marginBottom: '12px',
                      borderLeft: '3px solid #ff7a1a',
                      fontSize: '12px',
                      lineHeight: '1.5',
                      color: '#333',
                      whiteSpace: 'pre-wrap',
                      wordWrap: 'break-word',
                    }}
                  >
                    {documents[key]?.content || `No content set for ${config.title}`}
                  </div>
                  <button
                    onClick={() => handleEdit(key)}
                    style={{
                      padding: '8px 16px',
                      background: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '24px', padding: '12px', background: '#e6f5ef', borderRadius: '6px', borderLeft: '3px solid #1e9e6f' }}>
        <strong>ℹ️ Note:</strong> These documents are fetched by the rider app from this API endpoint. Any changes you make here will appear in the app on the next sync or screen reload.
      </div>
    </div>
  );
}