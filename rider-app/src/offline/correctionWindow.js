// rider-app/src/offline/correctionWindow.js
// SB-07: Centralized correction window logic
// Matches cleaned.html's CORRECTION_WINDOW_HOURS (default 24) and withinCorrectionWindow() exactly

const DEFAULT_CORRECTION_WINDOW_HOURS = 24;

/**
 * Returns hours elapsed since trip was recorded
 */
export function hoursSince(tripRecordedAtMs) {
  const now = Date.now();
  const elapsed = now - tripRecordedAtMs;
  return elapsed / (1000 * 60 * 60);
}

/**
 * Checks if a trip is still within its correction window.
 * Matches cleaned.html's withinCorrectionWindow() exactly.
 */
export function withinCorrectionWindow(trip, correctionWindowHours = DEFAULT_CORRECTION_WINDOW_HOURS) {
  if (!trip || !trip.recorded_at) return false;
  const tripTime = new Date(trip.recorded_at).getTime();
  const elapsed = hoursSince(tripTime);
  return elapsed < correctionWindowHours;
}

/**
 * Calculates remaining correction window hours for display.
 */
export function remainingCorrectionHours(trip, correctionWindowHours = DEFAULT_CORRECTION_WINDOW_HOURS) {
  if (!trip || !trip.recorded_at) return 0;
  const tripTime = new Date(trip.recorded_at).getTime();
  const elapsed = hoursSince(tripTime);
  return Math.max(0, correctionWindowHours - elapsed);
}

/**
 * Fetch correction window hours from synced master data.
 * Falls back to default if not configured.
 */
export async function getCorrectionWindowHours() {
  try {
    // TODO: Fetch from master data endpoint when available
    // const response = await api.get('/trips/config/correction-window');
    // return response.data.hours || DEFAULT_CORRECTION_WINDOW_HOURS;
    return DEFAULT_CORRECTION_WINDOW_HOURS;
  } catch (error) {
    console.warn('Failed to fetch correction window hours, using default:', error);
    return DEFAULT_CORRECTION_WINDOW_HOURS;
  }
}