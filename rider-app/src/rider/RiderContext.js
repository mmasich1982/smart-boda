// rider-app/src/rider/RiderContext.js
/**
 * RiderContext - Complete implementation with Lipa Later functionality
 * 
 * Manages:
 * - Rider authentication and profile
 * - Trip tracking (Cash, MPesa, Lipa Later)
 * - Lipa Later customer records and payments
 * - Sync status and offline queue
 * - Target milestones and achievements
 * 
 * ✅ FIXED: Added useRiderId() hook to correctly extract riderId from state.riderId
 */

import React, { createContext, useContext, useReducer, useCallback } from 'react';

/**
 * Create the context
 */
const RiderContext = createContext();

/**
 * Initial state
 */
const initialState = {
  // Rider Identity
  riderId: null,
  riderName: null,
  riderPhone: null,
  riderBike: null,
  
  // Authentication
  isAuthenticated: false,
  authToken: null,
  
  // Trip Tracking
  trips: [], // Array of all trips (Cash, MPesa, Lipa Later)
  _tripDraft: {
    amount: '',
    method: 'Cash', // 'Cash', 'MPesa', 'LipaLater'
    bikeIndex: 0,
  },
  
  // Lipa Later: Customer & Due-Date Capture
  _lipaLaterDraft: {
    customerName: '',
    customerPhone: '',
    amount: '',
    dueDate: '', // ISO format: YYYY-MM-DD
  },
  
  // Lipa Later: Customers Report State
  _lipaLaterCustomersPage: 1,
  _lipaLaterCustomersPerPage: 10,
  _lipaLaterCustomersSearch: '',
  
  // Lipa Later: Payment Recording
  _paymentDraft: {
    tripId: null,
    paymentType: 'full', // 'full' or 'partial'
    amount: '',
    notes: '',
  },
  
  // Sync & Connectivity
  online: true,
  lastSuccessfulSyncAt: null,
  syncRetryFailedOnce: false,
  forcedSyncFailure: false,
  
  // Daily/Weekly/Monthly Targets
  targets: {
    daily: { goal: 1000, reached: false },
    weekly: { goal: 5000, reached: false },
    monthly: { goal: 20000, reached: false },
  },
  
  // UI State
  loading: false,
  error: null,
};

/**
 * Reducer function - handles all state updates
 */
function riderReducer(state, action) {
  switch (action.type) {
    // ========== AUTHENTICATION & RIDER INFO ==========
    
    case 'SET_RIDER_ID':
      return {
        ...state,
        riderId: action.payload,
      };
    
    case 'SET_RIDER_INFO':
      return {
        ...state,
        riderId: action.payload.riderId,
        riderName: action.payload.riderName,
        riderPhone: action.payload.riderPhone,
        riderBike: action.payload.riderBike,
        isAuthenticated: true,
      };
    
    case 'CLEAR_RIDER_INFO':
      return {
        ...state,
        riderId: null,
        riderName: null,
        riderPhone: null,
        riderBike: null,
        isAuthenticated: false,
        authToken: null,
        trips: [],
      };
    
    // ========== TRIP MANAGEMENT ==========
    
    case 'ADD_TRIP':
      return {
        ...state,
        trips: [...(state.trips || []), action.payload],
        lastSuccessfulSyncAt: state.online ? new Date().toISOString() : state.lastSuccessfulSyncAt,
      };
    
    case 'UPDATE_TRIP':
      return {
        ...state,
        trips: (state.trips || []).map(trip =>
          trip.id === action.payload.id ? { ...trip, ...action.payload.updates } : trip
        ),
      };
    
    case 'DELETE_TRIP':
      return {
        ...state,
        trips: (state.trips || []).filter(trip => trip.id !== action.payload),
      };
    
    case 'SET_TRIPS':
      return {
        ...state,
        trips: action.payload,
      };
    
    // ========== TRIP DRAFT (for Cash/MPesa) ==========
    
    case 'SET_TRIP_DRAFT':
      return {
        ...state,
        _tripDraft: {
          ...state._tripDraft,
          ...action.payload,
        },
      };
    
    case 'CLEAR_TRIP_DRAFT':
      return {
        ...state,
        _tripDraft: {
          amount: '',
          method: 'Cash',
          bikeIndex: 0,
        },
      };
    
    // ========== LIPA LATER: CUSTOMER & DUE-DATE CAPTURE ==========
    
    case 'SET_LIPA_LATER_DRAFT':
      return {
        ...state,
        _lipaLaterDraft: {
          ...state._lipaLaterDraft,
          ...action.payload,
        },
      };
    
    case 'CLEAR_LIPA_LATER_DRAFT':
      return {
        ...state,
        _lipaLaterDraft: {
          customerName: '',
          customerPhone: '',
          amount: '',
          dueDate: '',
        },
      };
    
    // ========== LIPA LATER: ADD TRIP TO STATE.TRIPS ==========
    // CRITICAL: This actually creates and adds the Lipa Later trip to state.trips
    
    case 'ADD_LIPA_LATER_TRIP':
      return {
        ...state,
        trips: [...(state.trips || []), action.payload],
        _lipaLaterDraft: {
          customerName: '',
          customerPhone: '',
          amount: '',
          dueDate: '',
        },
        lastSuccessfulSyncAt: state.online ? new Date().toISOString() : state.lastSuccessfulSyncAt,
      };
    
    // ========== LIPA LATER: CUSTOMERS REPORT STATE ==========
    
    case 'SET_LIPA_LATER_CUSTOMERS_PAGE':
      return {
        ...state,
        _lipaLaterCustomersPage: action.payload,
      };
    
    case 'SET_LIPA_LATER_CUSTOMERS_SEARCH':
      return {
        ...state,
        _lipaLaterCustomersSearch: action.payload,
        _lipaLaterCustomersPage: 1, // Reset to first page when searching
      };
    
    case 'CLEAR_LIPA_LATER_CUSTOMERS_SEARCH':
      return {
        ...state,
        _lipaLaterCustomersSearch: '',
        _lipaLaterCustomersPage: 1,
      };
    
    // ========== LIPA LATER: PAYMENT RECORDING ==========
    
    case 'SET_PAYMENT_DRAFT':
      return {
        ...state,
        _paymentDraft: action.payload,
      };
    
    case 'CLEAR_PAYMENT_DRAFT':
      return {
        ...state,
        _paymentDraft: {
          tripId: null,
          paymentType: 'full',
          amount: '',
          notes: '',
        },
      };
    
    // CRITICAL: Record payment on Lipa Later trip
    case 'RECORD_PAYMENT':
      const { tripId, amount, paymentType, notes, paymentDate } = action.payload;
      return {
        ...state,
        trips: (state.trips || []).map(trip => {
          if (trip.id !== tripId || !trip.lipaLater) return trip;
          
          // Add new payment to payments array
          const payments = [...(trip.lipaLater.payments || [])];
          // CRITICAL FIX: Store payment as timestamp (milliseconds) to avoid timezone issues
          // paymentDate is YYYY-MM-DD format, parse as local date at midnight
          let paymentTimestamp;
          if (paymentDate) {
            const [year, month, day] = paymentDate.split('-');
            const localDate = new Date(year, month - 1, day, 0, 0, 0, 0);
            paymentTimestamp = localDate.getTime();
          } else {
            paymentTimestamp = new Date().getTime();
          }
          
          payments.push({
            amount: parseFloat(amount),
            date: paymentDate || new Date().toISOString().split('T')[0],
            timestamp: paymentTimestamp, // CRITICAL: Use timestamp for income calculations
            notes: notes.trim(),
          });

          // Calculate if fully settled
          const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
          const isFullySettled = totalPaid >= trip.lipaLater.originalAmount;

          return {
            ...trip,
            lipaLater: {
              ...trip.lipaLater,
              payments,
              settled: isFullySettled,
              settledAt: isFullySettled ? new Date().toISOString() : trip.lipaLater.settledAt,
            },
            syncStatus: state.online ? 'synced' : 'pending',
          };
        }),
        _paymentDraft: {
          tripId: null,
          paymentType: 'full',
          amount: '',
          notes: '',
        },
      };
    
    // ========== SYNC & CONNECTIVITY ==========
    
    case 'SET_ONLINE_STATUS':
      return {
        ...state,
        online: action.payload,
      };
    
    case 'SET_LAST_SYNC':
      return {
        ...state,
        lastSuccessfulSyncAt: action.payload,
      };
    
    case 'SET_SYNC_RETRY_FAILED':
      return {
        ...state,
        syncRetryFailedOnce: action.payload,
      };
    
    case 'TRIGGER_SYNC':
      return {
        ...state,
        // Dispatch this to trigger sync in your API layer
      };
    
    case 'RETRY_SYNC':
      return {
        ...state,
        syncRetryFailedOnce: false,
        // Dispatch this to trigger retry sync
      };
    
    case 'FORCE_SYNC_FAILURE':
      return {
        ...state,
        forcedSyncFailure: action.payload,
      };
    
    // ========== TARGETS & MILESTONES ==========
    
    case 'SET_TARGETS':
      return {
        ...state,
        targets: action.payload,
      };
    
    case 'UPDATE_TARGET':
      return {
        ...state,
        targets: {
          ...state.targets,
          [action.payload.period]: {
            goal: action.payload.goal,
            reached: action.payload.reached,
          },
        },
      };
    
    // ========== UI STATE ==========
    
    case 'SET_LOADING':
      return {
        ...state,
        loading: action.payload,
      };
    
    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
      };
    
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };
    
    // ========== DEFAULT ==========
    
    default:
      return state;
  }
}

/**
 * RiderProvider - Wraps the app with rider context
 */
export function RiderProvider({ children }) {
  const [state, dispatch] = useReducer(riderReducer, initialState);

  return (
    <RiderContext.Provider value={{ state, dispatch }}>
      {children}
    </RiderContext.Provider>
  );
}

/**
 * ✅ FIXED: Custom hook to use RiderContext (returns { state, dispatch })
 * Usage: const { state, dispatch } = useRider();
 */
export function useRider() {
  const context = useContext(RiderContext);
  if (!context) {
    throw new Error('useRider must be used within RiderProvider');
  }
  return context;
}

/**
 * ✅ NEW: Hook to extract riderId from state
 * Usage: const riderId = useRiderId();
 * This correctly extracts riderId from state.riderId
 */
export function useRiderId() {
  const { state } = useRider();
  return state.riderId;
}

/**
 * Helper selectors (optional - use in components or custom hooks)
 */

/**
 * Get today's running total (sum of all non-Lipa Later trips)
 */
export const getRunningTotalToday = (state) => {
  if (!state?.trips) return 0;
  const today = new Date().toISOString().split('T')[0];
  return state.trips
    .filter(t => {
      const tripDate = new Date(t.ts).toISOString().split('T')[0];
      return tripDate === today && t.method !== 'LipaLater';
    })
    .reduce((sum, t) => sum + (t.amount || 0), 0);
};

/**
 * Get pending Lipa Later trips
 */
export const getPendingLipaLaterTrips = (state) => {
  if (!state?.trips) return [];
  return state.trips.filter(t =>
    t.method === 'LipaLater' && t.lipaLater && !t.lipaLater.settled && t.status === 'active'
  );
};

/**
 * Get total pending Lipa Later amount
 */
export const getTotalPendingLipaLater = (state) => {
  const pending = getPendingLipaLaterTrips(state);
  return pending.reduce((sum, t) => {
    const remaining = getRemainingBalance(t.lipaLater);
    return sum + remaining;
  }, 0);
};

/**
 * Get remaining balance for a Lipa Later record
 */
export const getRemainingBalance = (lipaLaterRec) => {
  if (!lipaLaterRec || !lipaLaterRec.payments) {
    return lipaLaterRec?.originalAmount || 0;
  }
  const paid = lipaLaterRec.payments.reduce((s, p) => s + (p.amount || 0), 0);
  return Math.max(0, (lipaLaterRec.originalAmount || 0) - paid);
};

/**
 * Get total paid for a Lipa Later record
 */
export const getTotalPaid = (lipaLaterRec) => {
  if (!lipaLaterRec || !lipaLaterRec.payments) return 0;
  return lipaLaterRec.payments.reduce((s, p) => s + (p.amount || 0), 0);
};

/**
 * Get ageing category for a due date
 */
export const getAgeingCategory = (dueDate) => {
  const today = new Date().toISOString().split('T')[0];
  const due = new Date(dueDate + 'T00:00:00');
  const now = new Date(today + 'T00:00:00');
  const daysOverdue = Math.floor((now - due) / (1000 * 60 * 60 * 24));

  if (daysOverdue < 0) return 'upcoming';
  if (daysOverdue === 0) return 'due-today';
  if (daysOverdue <= 30) return 'overdue-30';
  if (daysOverdue <= 60) return 'overdue-60';
  if (daysOverdue <= 90) return 'overdue-90';
  return 'overdue-90plus';
};

/**
 * Get ageing category label with emoji
 */
export const getAgeingCategoryLabel = (category) => {
  const labels = {
    'upcoming': '📅 Due Soon',
    'due-today': '⚠️ Due Today',
    'overdue-30': '🔶 1-30 Days Overdue',
    'overdue-60': '🔴 31-60 Days Overdue',
    'overdue-90': '🚨 61-90 Days Overdue',
    'overdue-90plus': '🛑 90+ Days Overdue',
  };
  return labels[category] || category;
};

/**
 * Categorize pending trips by ageing
 */
export const categorizeByAgeing = (state) => {
  const pending = getPendingLipaLaterTrips(state);
  const buckets = {
    'upcoming': [],
    'due-today': [],
    'overdue-30': [],
    'overdue-60': [],
    'overdue-90': [],
    'overdue-90plus': []
  };

  pending.forEach(trip => {
    const category = getAgeingCategory(trip.lipaLater.dueDate);
    if (buckets[category]) {
      buckets[category].push(trip);
    }
  });

  return buckets;
};

/**
 * Get days overdue for a trip
 */
export const getDaysOverdue = (dueDate) => {
  const today = new Date().toISOString().split('T')[0];
  const due = new Date(dueDate + 'T00:00:00');
  const now = new Date(today + 'T00:00:00');
  return Math.floor((now - due) / (1000 * 60 * 60 * 24));
};

export default RiderContext;