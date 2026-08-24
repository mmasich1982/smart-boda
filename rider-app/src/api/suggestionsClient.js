// rider-app/src/api/suggestionsClient.js
/**
 * API client for Suggestions & Feedback (RA-35)
 * Handles all suggestion-related API calls with proper rider_id handling
 */
import api from './client';

export const suggestionsClient = {
  /**
   * Submit a suggestion or feedback
   * @param {string} riderId - The rider's ID
   * @param {string|null} categoryCode - Category code ('Idea', 'Problem', 'Compliment', 'Other')
   * @param {string} message - The feedback message (required, max 500 chars)
   * @returns {Promise} Response containing suggestion ID
   */
  submitSuggestion: async (riderId, categoryCode, message) => {
    try {
      const response = await api.post('/suggestions', {}, {
        params: {
          rider_id: riderId,
          category_code: categoryCode || 'Other',
          message: message.trim().substring(0, 500)
        }
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.detail || 'Failed to submit suggestion');
    }
  },

  /**
   * Retrieve rider's feedback history
   * @param {string} riderId - The rider's ID
   * @param {number} page - Page number (default 1)
   * @param {number} pageSize - Items per page (default 10)
   * @returns {Promise} Paginated feedback history
   */
  getFeedbackHistory: async (riderId, page = 1, pageSize = 10) => {
    try {
      const response = await api.get('/suggestions', {
        params: {
          rider_id: riderId,
          page,
          page_size: pageSize
        }
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.detail || 'Failed to load feedback history');
    }
  },

  /**
   * Validate suggestion message
   * @param {string} message - Message to validate
   * @returns {object} Validation result { isValid: boolean, errors: string[] }
   */
  validateMessage: (message) => {
    const errors = [];
    
    if (!message || !message.trim()) {
      errors.push('Message is required');
    }
    
    if (message && message.length > 500) {
      errors.push('Message must be 500 characters or less');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

export default suggestionsClient;