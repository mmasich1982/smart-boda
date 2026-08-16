// admin-console/src/hooks/useSuggestionsAdmin.js
/**
 * React Hook for Admin Suggestions Management (RA-35)
 * Retrieves and filters all rider suggestions
 */
import { useState, useCallback, useEffect } from 'react';
import { useApi } from './useApi';

export const useSuggestionsAdmin = () => {
  const { get, loading, error } = useApi();
  const [suggestions, setSuggestions] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({
    categoryCode: null,
    search: ''
  });

  /**
   * Load suggestions with current filters and pagination
   */
  const loadSuggestions = useCallback(async (pageNum = 1) => {
    try {
      const params = new URLSearchParams();
      params.append('page', pageNum);
      params.append('page_size', pageSize);
      
      if (filters.categoryCode) {
        params.append('category_code', filters.categoryCode);
      }
      if (filters.search && filters.search.trim()) {
        params.append('search', filters.search.trim());
      }

      const response = await get(`/admin/suggestions?${params.toString()}`);
      
      setSuggestions(response.items || []);
      setTotalPages(response.total_pages || 1);
      setTotal(response.total || 0);
      setPage(pageNum);
    } catch (err) {
      console.error('Failed to load suggestions:', err);
      setSuggestions([]);
      setTotalPages(1);
      setTotal(0);
    }
  }, [get, pageSize, filters]);

  /**
   * Apply category filter
   */
  const filterByCategory = useCallback((categoryCode) => {
    setFilters(f => ({ ...f, categoryCode }));
    setPage(1);
  }, []);

  /**
   * Apply search filter
   */
  const filterBySearch = useCallback((searchTerm) => {
    setFilters(f => ({ ...f, search: searchTerm }));
    setPage(1);
  }, []);

  /**
   * Clear all filters
   */
  const clearFilters = useCallback(() => {
    setFilters({ categoryCode: null, search: '' });
    setPage(1);
  }, []);

  /**
   * Navigate to previous page
   */
  const previousPage = useCallback(() => {
    const newPage = Math.max(1, page - 1);
    loadSuggestions(newPage);
  }, [page, loadSuggestions]);

  /**
   * Navigate to next page
   */
  const nextPage = useCallback(() => {
    const newPage = Math.min(totalPages, page + 1);
    loadSuggestions(newPage);
  }, [page, totalPages, loadSuggestions]);

  /**
   * Go to specific page
   */
  const goToPage = useCallback((pageNum) => {
    if (pageNum >= 1 && pageNum <= totalPages) {
      loadSuggestions(pageNum);
    }
  }, [totalPages, loadSuggestions]);

  /**
   * Get suggestion detail
   */
  const getSuggestion = useCallback(async (suggestionId) => {
    try {
      const response = await get(`/admin/suggestions/${suggestionId}`);
      return response;
    } catch (err) {
      console.error('Failed to load suggestion:', err);
      return null;
    }
  }, [get]);

  /**
   * Load suggestions when filters or page size changes
   */
  useEffect(() => {
    loadSuggestions(1);
  }, [pageSize]);

  /**
   * Load suggestions when filters change
   */
  useEffect(() => {
    loadSuggestions(1);
  }, [filters]);

  return {
    // Data
    suggestions,
    loading,
    error,
    
    // Pagination
    page,
    pageSize,
    setPageSize,
    totalPages,
    total,
    
    // Filters
    filters,
    filterByCategory,
    filterBySearch,
    clearFilters,
    
    // Actions
    loadSuggestions,
    previousPage,
    nextPage,
    goToPage,
    getSuggestion
  };
};

export default useSuggestionsAdmin;