// rider-app/src/offline/userRepository.js
// ADDED: User account operations including PIN verification for secure actions
// like detailed statement requests. Uses the backend PIN verification endpoint.

import api from '../api/client';

/**
 * Verifies the rider's PIN by sending it to the backend.
 * Used for secure operations that require PIN confirmation.
 *
 * @param {string} pin - The 4-digit PIN to verify
 * @returns {Promise<boolean>} - True if PIN is correct, false otherwise
 * @throws {Error} - If the request fails or rider is locked out
 */
export async function verifyRiderPin(pin) {
  try {
    // Call the PIN verification endpoint
    // This mirrors the PinLoginScreen approach but for in-app PIN verification
    const res = await api.post('/user/verify-pin', { pin });

    if (res?.data?.ok === true) {
      return true;
    }

    // PIN is incorrect but not locked
    return false;
  } catch (err) {
    // Check if it's a lockout error (typically 429 or specific error code from backend)
    if (err?.response?.status === 429 || err?.response?.data?.error === 'locked') {
      const error = new Error('Account locked due to too many attempts');
      error.code = 'ACCOUNT_LOCKED';
      error.attempts_left = err?.response?.data?.attempts_left ?? 0;
      throw error;
    }

    // For other errors, throw as-is
    throw err;
  }
}

/**
 * Gets the current rider's PIN attempts status
 * Useful for checking lockout state without attempting verification
 *
 * @returns {Promise<{attempts_left: number, locked: boolean, locked_until: string|null}>}
 */
export async function getPinStatus() {
  try {
    const res = await api.get('/user/pin-status');
    return res?.data ?? { attempts_left: 5, locked: false, locked_until: null };
  } catch (err) {
    // On error, assume account is not locked
    return { attempts_left: 5, locked: false, locked_until: null };
  }
}

/**
 * Resets PIN verification attempts (admin/support action)
 * @returns {Promise<boolean>} - True if successful
 */
export async function resetPinAttempts() {
  try {
    const res = await api.post('/user/reset-pin-attempts');
    return res?.data?.ok === true;
  } catch (err) {
    console.error('Failed to reset PIN attempts:', err);
    return false;
  }
}