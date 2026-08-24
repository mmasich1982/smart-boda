// rider-app/src/hooks/useSuggestions.js
/**
 * FIXED: React Hook for Suggestions & Feedback (RA-35)
 * Manages suggestion submission and history retrieval
 * - Now supports getting riderId from parameter or RiderContext
 * - Ensures rider_id is always available for API calls
 */
import { useState, useCallback } from 'react';
import suggestionsClient from '../api/suggestionsClient';
import { useRider } from '../rider/RiderContext';

export const useSuggestions = (providedRiderId = null) => {
  const { state } = useRider();
  // FIXED: Use provided riderId or fallback to RiderContext
  const riderId = providedRiderId || state?.riderId;

  const [category, setCategory] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState({
    items: [],
    page: 1,
    total_pages: 1,
    total: 0
  });
  const [historyPage, setHistoryPage] = useState(1);

  /**
   * Validate current message
   */
  const validateMessage = useCallback(() => {
    return suggestionsClient.validateMessage(message);
  }, [message]);

  /**
   * Submit suggestion
   */
  const submitSuggestion = useCallback(async () => {
    if (!riderId) {
      setError('Rider ID not found. Please log in again.');
      return { success: false, error: 'Rider ID not found' };
    }

    const validation = suggestionsClient.validateMessage(message);
    if (!validation.isValid) {
      setError(validation.errors[0]);
      return { success: false, error: validation.errors[0] };
    }

    try {
      setLoading(true);
      setError(null);
      
      const result = await suggestionsClient.submitSuggestion(
        riderId,
        category,
        message
      );

      // Reset form
      setCategory(null);
      setMessage('');
      setHistoryPage(1);

      // Reload history
      await loadHistory(1);

      return { success: true, suggestionId: result.id };
    } catch (err) {
      setError(err.message || 'Failed to submit suggestion');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [riderId, category, message]);

  /**
   * Load feedback history
   */
  const loadHistory = useCallback(async (page = 1) => {
    if (!riderId) {
      setError('Rider ID not found. Please log in again.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const result = await suggestionsClient.getFeedbackHistory(
        riderId,
        page,
        10 // 10 items per page
      );

      setHistory({
        items: result.items || [],
        page: result.page || 1,
        total_pages: result.total_pages || 1,
        total: result.total || 0
      });

      setHistoryPage(page);
    } catch (err) {
      setError(err.message || 'Failed to load history');
      setHistory({
        items: [],
        page: 1,
        total_pages: 1,
        total: 0
      });
    } finally {
      setLoading(false);
    }
  }, [riderId]);

  /**
   * Navigate to previous history page
   */
  const previousPage = useCallback(() => {
    const newPage = Math.max(1, historyPage - 1);
    loadHistory(newPage);
  }, [historyPage, loadHistory]);

  /**
   * Navigate to next history page
   */
  const nextPage = useCallback(() => {
    const newPage = Math.min(history.total_pages, historyPage + 1);
    loadHistory(newPage);
  }, [historyPage, history.total_pages, loadHistory]);

  /**
   * Reset form and errors
   */
  const reset = useCallback(() => {
    setCategory(null);
    setMessage('');
    setError(null);
  }, []);

  return {
    // Form state
    category,
    setCategory,
    message,
    setMessage,
    
    // UI state
    loading,
    error,
    
    // History state
    history,
    historyPage,
    
    // Actions
    submitSuggestion,
    loadHistory,
    previousPage,
    nextPage,
    validateMessage,
    reset,
    
    // Rider ID (for debugging/logging)
    riderId
  };
};

export default useSuggestions;