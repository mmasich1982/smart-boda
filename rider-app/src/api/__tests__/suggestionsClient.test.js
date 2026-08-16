// rider-app/src/api/__tests__/suggestionsClient.test.js
/**
 * Tests for Suggestions Client (RA-35)
 * jest suggestionsClient.test.js
 */
import suggestionsClient from '../suggestionsClient';

// Mock the API client
jest.mock('../client', () => ({
  post: jest.fn(),
  get: jest.fn()
}));

import api from '../client';

describe('suggestionsClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('submitSuggestion', () => {
    it('should submit a suggestion with category', async () => {
      const mockResponse = { data: { id: 'FBK-1234' } };
      api.post.mockResolvedValue(mockResponse);

      const result = await suggestionsClient.submitSuggestion(
        'rider-123',
        'Idea',
        'Great feature idea'
      );

      expect(result.id).toBe('FBK-1234');
      expect(api.post).toHaveBeenCalledWith(
        '/suggestions',
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            rider_id: 'rider-123',
            category_code: 'Idea',
            message: 'Great feature idea'
          })
        })
      );
    });

    it('should default category to Other if not provided', async () => {
      const mockResponse = { data: { id: 'FBK-5678' } };
      api.post.mockResolvedValue(mockResponse);

      await suggestionsClient.submitSuggestion('rider-123', null, 'Some feedback');

      expect(api.post).toHaveBeenCalledWith(
        '/suggestions',
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            category_code: 'Other'
          })
        })
      );
    });

    it('should trim whitespace from message', async () => {
      const mockResponse = { data: { id: 'FBK-1234' } };
      api.post.mockResolvedValue(mockResponse);

      await suggestionsClient.submitSuggestion(
        'rider-123',
        'Problem',
        '  Whitespace message  '
      );

      expect(api.post).toHaveBeenCalledWith(
        '/suggestions',
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            message: 'Whitespace message'
          })
        })
      );
    });

    it('should truncate message to 500 characters', async () => {
      const mockResponse = { data: { id: 'FBK-1234' } };
      api.post.mockResolvedValue(mockResponse);

      const longMessage = 'a'.repeat(600);
      await suggestionsClient.submitSuggestion('rider-123', 'Other', longMessage);

      expect(api.post).toHaveBeenCalledWith(
        '/suggestions',
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            message: 'a'.repeat(500)
          })
        })
      );
    });

    it('should handle API errors', async () => {
      const mockError = {
        response: { data: { detail: 'Server error' } }
      };
      api.post.mockRejectedValue(mockError);

      await expect(
        suggestionsClient.submitSuggestion('rider-123', 'Idea', 'Test')
      ).rejects.toThrow('Server error');
    });
  });

  describe('getFeedbackHistory', () => {
    it('should retrieve feedback history', async () => {
      const mockResponse = {
        data: {
          items: [
            { id: '1', category_code: 'Idea', message: 'Test' }
          ],
          page: 1,
          total_pages: 1,
          total: 1
        }
      };
      api.get.mockResolvedValue(mockResponse);

      const result = await suggestionsClient.getFeedbackHistory('rider-123');

      expect(result.items.length).toBe(1);
      expect(api.get).toHaveBeenCalledWith(
        '/suggestions',
        expect.objectContaining({
          params: expect.objectContaining({
            rider_id: 'rider-123',
            page: 1,
            page_size: 10
          })
        })
      );
    });

    it('should support pagination', async () => {
      const mockResponse = { data: { items: [], page: 2, total_pages: 5, total: 50 } };
      api.get.mockResolvedValue(mockResponse);

      await suggestionsClient.getFeedbackHistory('rider-123', 2, 20);

      expect(api.get).toHaveBeenCalledWith(
        '/suggestions',
        expect.objectContaining({
          params: expect.objectContaining({
            page: 2,
            page_size: 20
          })
        })
      );
    });

    it('should handle empty history', async () => {
      const mockResponse = {
        data: { items: [], page: 1, total_pages: 1, total: 0 }
      };
      api.get.mockResolvedValue(mockResponse);

      const result = await suggestionsClient.getFeedbackHistory('rider-123');

      expect(result.items.length).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should handle API errors', async () => {
      const mockError = {
        response: { data: { detail: 'Failed to load' } }
      };
      api.get.mockRejectedValue(mockError);

      await expect(
        suggestionsClient.getFeedbackHistory('rider-123')
      ).rejects.toThrow('Failed to load');
    });
  });

  describe('validateMessage', () => {
    it('should validate required message', () => {
      const result = suggestionsClient.validateMessage('');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Message is required');
    });

    it('should validate message length', () => {
      const longMessage = 'a'.repeat(501);
      const result = suggestionsClient.validateMessage(longMessage);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('500 characters');
    });

    it('should accept valid message', () => {
      const result = suggestionsClient.validateMessage('Valid feedback');
      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should trim whitespace for validation', () => {
      const result = suggestionsClient.validateMessage('   ');
      expect(result.isValid).toBe(false);
    });
  });
});