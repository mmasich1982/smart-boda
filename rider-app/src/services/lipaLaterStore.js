/**
 * lipaLaterStore.js
 * Zustand store for managing Lipa Later records and operations
 * UPDATED: Added createLipaLaterTrip method for the new Lipa Later Details flow
 */

import { create } from 'zustand';
import { api } from '../api/client';

export const useLipaLaterStore = create((set, get) => (({
  records: [],
  loading: false,
  error: null,

  /**
   * Fetch Lipa Later records for the rider
   * @param {string} riderId - The rider ID
   * @param {boolean} includePaid - Include paid records in results
   */
  fetchRecords: async (riderId, includePaid = false) => {
    set({ loading: true, error: null });
    try {
      const response = await api.get(`/trips/lipa-later`, {
        params: {
          rider_id: riderId,
          include_paid: includePaid,
        },
      });
      set({ records: response.data, loading: false });
    } catch (error) {
      set({
        error: error.message || 'Failed to fetch Lipa Later records',
        loading: false,
      });
    }
  },

  /**
   * Create a new Lipa Later trip (used in LipaLaterDetailsScreen)
   * @param {object} payload - Contains customer_name, customer_mobile, amount, due_date
   * @param {string} riderId - The rider ID for authorization
   */
  createLipaLaterTrip: async (payload, riderId) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post(`/trips/lipa-later`, payload, {
        params: { rider_id: riderId },
      });
      
      set({ loading: false });
      return response.data;
    } catch (error) {
      set({
        error: error.message || 'Failed to create Lipa Later trip',
        loading: false,
      });
      throw error;
    }
  },

  /**
   * Mark a Lipa Later record as paid
   * @param {string} recordId - The record ID to mark as paid
   */
  markAsPaid: async (recordId) => {
    try {
      const response = await api.patch(`/trips/lipa-later/${recordId}/mark-paid`);
      
      // Update local store
      const records = get().records;
      const updatedRecords = records.map(r =>
        r.id === recordId ? { ...r, status: 'paid', paid_at: new Date() } : r
      );
      set({ records: updatedRecords });
      
      return response.data;
    } catch (error) {
      set({ error: error.message || 'Failed to mark record as paid' });
      throw error;
    }
  },

  /**
   * Create a new Lipa Later record (deferred payment) - alternative method
   * @param {string} riderId - The rider ID
   * @param {object} payload - The payment data
   */
  createRecord: async (riderId, payload) => {
    try {
      const response = await api.post(`/trips/lipa-later`, payload, {
        params: { rider_id: riderId },
      });
      
      // Fetch updated records to reflect new entry
      const records = get().records;
      set({ records: [response.data, ...records] });
      
      return response.data;
    } catch (error) {
      set({ error: error.message || 'Failed to create Lipa Later record' });
      throw error;
    }
  },

  /**
   * Get statistics for Lipa Later records
   */
  getStats: () => {
    const records = get().records;
    const pending = records.filter(r => r.status === 'pending');
    const paid = records.filter(r => r.status === 'paid');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdue = pending.filter(r => new Date(r.due_date) < today);
    const dueToday = pending.filter(r => new Date(r.due_date).getTime() === today.getTime());

    return {
      total: records.length,
      pending: pending.length,
      paid: paid.length,
      overdue: overdue.length,
      dueToday: dueToday.length,
      totalPending: pending.reduce((sum, r) => sum + parseFloat(r.amount), 0),
      totalPaid: paid.reduce((sum, r) => sum + parseFloat(r.amount), 0),
    };
  },

  /**
   * Get ageing report data
   */
  getAgeingReport: () => {
    const records = get().records;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const current = [];
    const overdue31to60 = [];
    const overdue61to90 = [];
    const overdueOver90 = [];

    records.forEach(record => {
      if (record.status !== 'pending') return;
      
      const dueDate = new Date(record.due_date);
      dueDate.setHours(0, 0, 0, 0);
      
      const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
      
      if (daysOverdue <= 0) {
        current.push(record);
      } else if (daysOverdue <= 60) {
        overdue31to60.push(record);
      } else if (daysOverdue <= 90) {
        overdue61to90.push(record);
      } else {
        overdueOver90.push(record);
      }
    });

    return {
      current: {
        records: current,
        total: current.reduce((sum, r) => sum + parseFloat(r.amount), 0),
      },
      overdue31to60: {
        records: overdue31to60,
        total: overdue31to60.reduce((sum, r) => sum + parseFloat(r.amount), 0),
      },
      overdue61to90: {
        records: overdue61to90,
        total: overdue61to90.reduce((sum, r) => sum + parseFloat(r.amount), 0),
      },
      overdueOver90: {
        records: overdueOver90,
        total: overdueOver90.reduce((sum, r) => sum + parseFloat(r.amount), 0),
      },
    };
  },

  /**
   * Clear error state
   */
  clearError: () => set({ error: null }),

  /**
   * Clear all records (logout scenario)
   */
  reset: () => set({ records: [], loading: false, error: null }),
})));