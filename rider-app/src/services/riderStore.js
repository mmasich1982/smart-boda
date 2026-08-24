/**
 * riderStore.js
 * Zustand store for managing global rider state
 * Provides riderId and other rider-related state
 */

import { create } from 'zustand';
import { getLocalRiderStatus } from '../offline/db';

export const useRiderStore = create((set) => ({
  riderId: null,
  riderData: null,
  loading: false,
  error: null,

  /**
   * Initialize rider store from local storage
   */
  initRider: async () => {
    set({ loading: true });
    try {
      const status = await getLocalRiderStatus();
      if (status?.rider_id) {
        set({
          riderId: status.rider_id,
          riderData: status,
          loading: false,
          error: null,
        });
      } else {
        set({ loading: false, error: 'No rider found' });
      }
    } catch (error) {
      set({
        loading: false,
        error: error.message || 'Failed to initialize rider',
      });
    }
  },

  /**
   * Set rider ID
   */
  setRiderId: (riderId) => set({ riderId }),

  /**
   * Set rider data
   */
  setRiderData: (riderData) => set({ riderData }),

  /**
   * Clear rider state (logout)
   */
  clearRider: () => set({ riderId: null, riderData: null, error: null }),

  /**
   * Clear error
   */
  clearError: () => set({ error: null }),
}));