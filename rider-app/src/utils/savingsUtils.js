// rider-app/src/utils/savingsUtils.js

export function savingsPeriodDays(frequency) {
  if (frequency === 'Daily') return 1;
  if (frequency === 'Weekly') return 7;
  if (frequency === 'Monthly') return 30;
  return 7; // default Weekly
}

export function calculateSavingsProgress(account) {
  const periodMs = savingsPeriodDays(account.frequency) * 24 * 60 * 60 * 1000;
  const periodsElapsed = Math.max(0, Math.floor((Date.now() - account.created_at) / periodMs));
  
  const contributions = account.contributions || [];
  const manualSaved = contributions.reduce((sum, c) => sum + (c.amount || 0), 0);
  
  return {
    periodsElapsed,
    totalSaved: periodsElapsed * (account.amount || 0) + manualSaved,
  };
}

export function getPeriodRange(period) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start, end;
  
  const endMs = today.getTime() + 24 * 60 * 60 * 1000;
  
  if (period === 'thisMonth') {
    start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    end = endMs;
  } else if (period === 'lastMonth') {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1);
    start = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1).getTime();
    end = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  } else if (period === 'last6') {
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6);
    start = sixMonthsAgo.getTime();
    end = endMs;
  } else if (period === 'sinceJoining') {
    start = 0;
    end = endMs;
  }
  
  return { start, end };
}

export const PERIOD_LABELS = {
  thisMonth: 'This Month',
  lastMonth: 'Last Month',
  last6: 'Last 6 Months',
  sinceJoining: 'Since Joining',
};

export function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  const dateStr = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} · ${timeStr}`;
}