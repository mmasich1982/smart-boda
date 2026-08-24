// admin-console/src/pages/SuggestionsQueue.jsx
import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import '../pages/SuggestionsQueue.css';

const SUGGESTION_CATEGORIES = [
  { key: 'Idea', emoji: '💡', label: 'I Have An Idea' },
  { key: 'Problem', emoji: '😕', label: 'Something\'s Wrong' },
  { key: 'Compliment', emoji: '❤️', label: 'Just Saying Thanks' },
  { key: 'Other', emoji: '💬', label: 'Something Else' },
];

export default function SuggestionsQueue() {
  const { get, loading, error } = useApi();
  const [suggestions, setSuggestions] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadSuggestions();
  }, [page, selectedCategory]);

  async function loadSuggestions() {
    try {
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('page_size', 20);
      if (selectedCategory) params.append('category_code', selectedCategory);
      if (searchTerm) params.append('search', searchTerm);

      const response = await get(`/admin/suggestions?${params.toString()}`);
      setSuggestions(response.items || []);
      setTotalPages(response.total_pages || 1);
      setTotal(response.total || 0);
    } catch (err) {
      console.error('Failed to load suggestions:', err);
    }
  }

  function handleSearch() {
    setPage(1);
    loadSuggestions();
  }

  function getCategoryInfo(code) {
    return SUGGESTION_CATEGORIES.find(c => c.key === code) || { emoji: '💬', label: 'Other' };
  }

  return (
    <div className="suggestions-container">
      <div className="suggestions-header">
        <h1>Rider Feedback & Suggestions (RA-35)</h1>
        <p className="suggestions-meta">Total: {total} feedback entries</p>
      </div>

      <div className="suggestions-filters">
        <div className="filter-group">
          <label>Search by Message</label>
          <div className="search-row">
            <input
              type="text"
              placeholder="Search feedback content..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button onClick={handleSearch} className="btn-search">Search</button>
          </div>
        </div>

        <div className="filter-group">
          <label>Filter by Category</label>
          <div className="category-chips">
            <button
              className={`chip ${!selectedCategory ? 'active' : ''}`}
              onClick={() => { setSelectedCategory(null); setPage(1); }}
            >
              All Categories
            </button>
            {SUGGESTION_CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                className={`chip ${selectedCategory === cat.key ? 'active' : ''}`}
                onClick={() => { setSelectedCategory(cat.key); setPage(1); }}
              >
                {cat.emoji} {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <div className="loading-state">Loading feedback...</div>}
      {error && <div className="error-state">Error loading suggestions: {error}</div>}

      {!loading && suggestions.length > 0 && (
        <div className="suggestions-list">
          {suggestions.map((suggestion) => {
            const catInfo = getCategoryInfo(suggestion.category_code);
            return (
              <div key={suggestion.id} className="suggestion-card">
                <div className="card-header">
                  <div className="category-badge">
                    <span className="emoji">{catInfo.emoji}</span>
                    <span className="label">{catInfo.label}</span>
                  </div>
                  <div className="card-meta">
                    <span className="rider-id">Rider: {suggestion.rider_id}</span>
                    <span className="submitted-date">
                      {new Date(suggestion.submitted_at).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="card-body">
                  <p className="message">{suggestion.message}</p>
                </div>
                <div className="card-footer">
                  <span className="suggestion-id">{suggestion.id}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && suggestions.length === 0 && (
        <div className="empty-state">
          <p>No feedback found for the selected filters.</p>
        </div>
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="btn-pagination"
          >
            ← Previous
          </button>
          <span className="page-info">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="btn-pagination"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}