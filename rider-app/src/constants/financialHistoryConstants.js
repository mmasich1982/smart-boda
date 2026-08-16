/**
 * financialHistoryConstants.js
 * Configuration constants for financial history and statement features
 */

// Statement purposes - predefined options for statement generation
export const STATEMENT_PURPOSES = [
  'Loan Application',
  'Bank Account Opening',
  'Visa Application',
  'Tax Filing',
  'Business Registration',
  'Investor Information',
  'Insurance Claim',
  'Rental Application',
  'Government Subsidy Application',
  'Personal Records',
  'Other',
];

// SLA for detailed statements - how long admin has to deliver
export const DETAILED_STATEMENT_SLA_HOURS = 24;

// Quick select period configurations
export const QUICK_SELECT_PERIODS = {
  thisMonth: {
    key: 'thisMonth',
    label: 'This Month',
    description: 'Current calendar month',
  },
  lastMonth: {
    key: 'lastMonth',
    label: 'Last Month',
    description: 'Previous calendar month',
  },
  last3: {
    key: 'last3',
    label: 'Last 3 Months',
    description: 'Past 90 days',
  },
  last6: {
    key: 'last6',
    label: 'Last 6 Months',
    description: 'Past 180 days',
  },
  sinceJoining: {
    key: 'sinceJoining',
    label: 'Since Joining',
    description: 'From registration date',
  },
};

// Transaction type filters
export const TRANSACTION_TYPES = {
  all: { key: 'all', label: 'All' },
  trip: { key: 'trip', label: 'Trips' },
  fuel: { key: 'fuel', label: 'Fuel' },
  maintenance: { key: 'maintenance', label: 'Service' },
  other: { key: 'other', label: 'Other Expense' },
};

// Expense categories
export const EXPENSE_CATEGORIES = [
  'Fuel/Energy',
  'Service',
  'Insurance',
  'Loan Repayment',
  'Utilities',
  'Family Support',
  'Miscellaneous',
];

// Statement status
export const STATEMENT_STATUS = {
  DRAFT: 'draft',
  GENERATED: 'generated',
  VERIFIED: 'verified',
  DOWNLOADED: 'downloaded',
  ARCHIVED: 'archived',
};

// Detailed statement request status
export const DETAILED_STATEMENT_REQUEST_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
};

// Cache durations (in milliseconds)
export const CACHE_DURATIONS = {
  FINANCIAL_SUMMARY: 5 * 60 * 1000, // 5 minutes
  TRANSACTION_LIST: 2 * 60 * 1000, // 2 minutes
  STATEMENT_LIST: 10 * 60 * 1000, // 10 minutes
};

// PDF generation configuration
export const PDF_CONFIG = {
  FILENAME_FORMAT: 'SmartBoda-Statement-{STATEMENT_ID}.pdf',
  PAGE_SIZE: 'A4',
  MARGINS: 14, // mm
  FONT_SIZE_TITLE: 15,
  FONT_SIZE_BODY: 10,
  FONT_SIZE_SMALL: 9,
};

// UI Messages
export const MESSAGES = {
  STATEMENT: {
    GENERATED_SUCCESS: 'Statement generated successfully',
    DOWNLOADED_SUCCESS: 'Statement downloaded as PDF',
    VERIFIED: 'Statement verified and ready',
    DETAILED_REQUEST_SUBMITTED: 'Detailed statement request submitted',
    DETAILED_REQUEST_SOONBOX: (hours) =>
      `Your detailed statement will be sent within ${hours} hours`,
  },
  TRANSACTION: {
    NO_TRANSACTIONS: 'No transactions match this filter',
    LOADING: 'Loading transactions...',
  },
  FINANCIAL: {
    NO_EXPENSES: 'No expenses in this range',
    LOADING: 'Loading financial history...',
  },
};

// Email validation
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// PIN configuration
export const PIN_CONFIG = {
  LENGTH: 4,
  MAX_ATTEMPTS: 5,
  LOCKOUT_DURATION_MS: 15 * 60 * 1000, // 15 minutes
};

// Trading day configuration
export const TRADING_DAY_START_HOUR = 4; // 4 AM local time

// Chart colors for expense categories
export const CATEGORY_COLORS = {
  'Fuel/Energy': '#ff7a1a',
  'Service': '#1e9e6f',
  'Insurance': '#8b5cf6',
  'Loan Repayment': '#ff6b9d',
  'Utilities': '#00c9ff',
  'Family Support': '#ffa502',
  'Miscellaneous': '#c0c0c0',
};

// Percentage ranges for profit margin
export const PROFIT_MARGIN_RANGES = {
  EXCELLENT: { min: 0.6, label: 'Excellent', color: '#1e9e6f' },
  GOOD: { min: 0.4, max: 0.6, label: 'Good', color: '#00c9ff' },
  FAIR: { min: 0.2, max: 0.4, label: 'Fair', color: '#ffa502' },
  LOW: { max: 0.2, label: 'Low', color: '#ff7a1a' },
};

export default {
  STATEMENT_PURPOSES,
  DETAILED_STATEMENT_SLA_HOURS,
  QUICK_SELECT_PERIODS,
  TRANSACTION_TYPES,
  EXPENSE_CATEGORIES,
  STATEMENT_STATUS,
  DETAILED_STATEMENT_REQUEST_STATUS,
  CACHE_DURATIONS,
  PDF_CONFIG,
  MESSAGES,
  EMAIL_REGEX,
  PIN_CONFIG,
  TRADING_DAY_START_HOUR,
  CATEGORY_COLORS,
  PROFIT_MARGIN_RANGES,
};