/**
 * tripConstants.js
 * Constants for trip entry, correction, and daily trade summary
 */

// Correction window: 24 hours from trip creation
export const CORRECTION_WINDOW_HOURS = 24;

// Valid correction reasons
export const CORRECTION_REASONS = [
  'Wrong amount entered',
  'Customer negotiated price',
  'Duplicate entry',
  'Test trip',
  'Other (specify in admin)',
];

// Trip statuses
export const TRIP_STATUSES = {
  ACTIVE: 'active',
  VOIDED: 'voided',
  DISPUTED: 'disputed',
};

// Sync statuses
export const SYNC_STATUSES = {
  PENDING: 'pending',
  SYNCED: 'synced',
  FAILED: 'failed',
};

// Payment methods
export const PAYMENT_METHODS = {
  CASH: 'Cash',
  MPESA: 'MPesa',
  LIPA_LATER: 'LipaLater',
};

export const PAYMENT_METHOD_LABELS = {
  Cash: {
    label: 'Cash',
    emoji: '💵',
    color: '#ff7a1a',
  },
  MPesa: {
    label: 'M-Pesa',
    emoji: '📱',
    color: '#1e9e6f',
  },
  LipaLater: {
    label: 'Lipa Later',
    emoji: '🧾',
    color: '#8b5cf6',
  },
};

// Trading day start time (4 AM local time)
export const TRADING_DAY_START_HOUR = 4;

// Lipa Later configuration
export const LIPA_LATER_CONFIG = {
  PAYMENT_PENDING_LABEL: 'Payment Pending',
  SETTLEMENT_REMINDER_DAYS: 3,
  OVERDUE_DAYS: 7,
  CRITICAL_OVERDUE_DAYS: 14,
};

// Numeric validation
export const TRIP_AMOUNT_CONFIG = {
  MIN_AMOUNT: 0.01,
  MAX_AMOUNT: 999999,
  DECIMAL_PLACES: 2,
};

// Cache durations (in milliseconds)
export const CACHE_DURATIONS = {
  DAILY_SUMMARY: 5 * 60 * 1000, // 5 minutes
  TRIP_LIST: 2 * 60 * 1000,     // 2 minutes
  PAYMENT_METHODS: 30 * 60 * 1000, // 30 minutes
};

// UI Messaging
export const MESSAGES = {
  TRIP: {
    CORRECTED_SUCCESS: "Trip updated. Today's total is now updated.",
    VOIDED_SUCCESS: "Trip removed from today's total. You can view voided trips anytime.",
    CORRECTION_OOW_SUCCESS: "Your correction request has been submitted. We'll update you within 72 hours.",
    CORRECTION_WINDOW_CLOSED: "This trip can no longer be edited directly — its 24-hour correction window has closed.",
    ENTER_REASON: 'Select a Correction Reason to continue.',
    ENTER_AMOUNT: 'Corrected amount must be greater than zero.',
    CONFIRM_VOID: 'Please confirm the Void action — this is a second, deliberate step.',
  },
};

export default {
  CORRECTION_WINDOW_HOURS,
  CORRECTION_REASONS,
  TRIP_STATUSES,
  SYNC_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  LIPA_LATER_CONFIG,
  MESSAGES,
};