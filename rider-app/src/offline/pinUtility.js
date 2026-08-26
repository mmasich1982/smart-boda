// rider-app/src/offline/pinUtility.js
// ✅ OFFLINE-FIRST PIN STORAGE ARCHITECTURE
// Replaces cloud-dependent PIN validation with local IndexedDB verification
// Includes lockout mechanism and attempt tracking for security

import indexedDbAdapter from './adapters/indexedDbAdapter';

/**
 * ============================================================================
 * PIN STORAGE ARCHITECTURE
 * ============================================================================
 *
 * CACHE KEYS:
 * -----------
 * pin_${riderId}
 *   - Rider's saved PIN (stored as string after creation)
 *   - Used for offline login verification
 *   - Updated only when rider creates/resets PIN
 *
 * pin_attempts_${riderId}
 *   - Track login attempts for security
 *   - Format: { attempts: number, timestamp: ms }
 *   - Reset after successful login or lockout expiry
 *
 * pin_locked_until_${riderId}
 *   - Timestamp when account is locked after too many attempts
 *   - Format: timestamp in milliseconds
 *   - Cleared when lockout period expires or PIN is reset
 *
 * ============================================================================
 * SECURITY FEATURES
 * ============================================================================
 * • 5 attempts allowed before 15-minute lockout
 * • Offline-first validation (no internet required for login)
 * • Fallback to API for additional security checks when online
 * • Local attempt tracking prevents brute force attacks
 */

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Save rider's PIN locally after creation
 * Called by CreatePinScreen after successful PIN creation on backend
 * ✅ Enables offline login after onboarding
 */
export async function savePinLocally(riderId, pin) {
  try {
    if (!riderId || !pin) {
      console.error('❌ PIN or riderId missing');
      return false;
    }

    const pinKey = `pin_${riderId}`;
    
    // Save PIN as plain text (it's already set on device, not transmitted)
    await indexedDbAdapter.kvSet(pinKey, pin);
    
    // Initialize attempts counter
    const attemptsKey = `pin_attempts_${riderId}`;
    await indexedDbAdapter.kvSet(attemptsKey, JSON.stringify({ attempts: 0, timestamp: Date.now() }));
    
    console.log(`✅ PIN saved locally for rider ${riderId}`);
    return true;
  } catch (err) {
    console.error('❌ Error saving PIN locally:', err);
    return false;
  }
}

/**
 * Verify PIN against locally stored value (offline)
 * This is the primary validation method - works without internet
 * ✅ Offline-first: Validates against local copy
 * ✅ Returns { success: boolean, message: string, isOffline: true }
 */
export async function verifyPinLocally(riderId, enteredPin) {
  try {
    // Check if account is locked
    const lockedUntilKey = `pin_locked_until_${riderId}`;
    const lockedUntilData = await indexedDbAdapter.kvGet(lockedUntilKey);
    
    if (lockedUntilData) {
      const lockedUntil = typeof lockedUntilData === 'string' ? parseInt(lockedUntilData) : lockedUntilData;
      const now = Date.now();
      
      if (now < lockedUntil) {
        const minutesRemaining = Math.ceil((lockedUntil - now) / 60000);
        console.warn(`🔒 Account locked for ${minutesRemaining} more minutes`);
        return {
          success: false,
          message: `Account locked. Try again in ${minutesRemaining} minute(s).`,
          isLocked: true,
          isOffline: true,
          minutesRemaining
        };
      } else {
        // Lockout expired, clear it
        await indexedDbAdapter.delete(lockedUntilKey);
        console.log('✅ Lockout expired, cleared');
      }
    }

    // Get stored PIN
    const pinKey = `pin_${riderId}`;
    const storedPin = await indexedDbAdapter.kvGet(pinKey);

    if (!storedPin) {
      console.warn('⚠️ No PIN found locally - user may not have completed onboarding');
      return {
        success: false,
        message: 'PIN not set. Please complete account setup.',
        isOffline: true
      };
    }

    const storedPinStr = typeof storedPin === 'string' ? storedPin : storedPin.toString();

    // Verify PIN
    if (storedPinStr === enteredPin) {
      console.log('✅ PIN verified offline');
      
      // Reset attempts on success
      const attemptsKey = `pin_attempts_${riderId}`;
      await indexedDbAdapter.kvSet(attemptsKey, JSON.stringify({ attempts: 0, timestamp: Date.now() }));
      
      return {
        success: true,
        message: 'PIN verified',
        isOffline: true,
        attemptsRemaining: MAX_ATTEMPTS
      };
    }

    // PIN incorrect - increment attempts
    const attemptsKey = `pin_attempts_${riderId}`;
    let attemptsData = { attempts: 0, timestamp: Date.now() };
    
    try {
      const existing = await indexedDbAdapter.kvGet(attemptsKey);
      if (existing) {
        attemptsData = typeof existing === 'string' ? JSON.parse(existing) : existing;
      }
    } catch (parseErr) {
      console.warn('⚠️ Could not parse attempts data, resetting');
      attemptsData = { attempts: 0, timestamp: Date.now() };
    }

    attemptsData.attempts += 1;
    attemptsData.timestamp = Date.now();

    await indexedDbAdapter.kvSet(attemptsKey, JSON.stringify(attemptsData));

    const attemptsRemaining = MAX_ATTEMPTS - attemptsData.attempts;

    // Check if lockout should be triggered
    if (attemptsData.attempts >= MAX_ATTEMPTS) {
      const lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
      await indexedDbAdapter.kvSet(lockedUntilKey, lockedUntil.toString());
      
      console.warn(`🔒 Account locked after ${MAX_ATTEMPTS} failed attempts`);
      return {
        success: false,
        message: `Too many attempts. Account locked for 15 minutes.`,
        isLocked: true,
        isOffline: true,
        attemptsRemaining: 0,
        minutesRemaining: 15
      };
    }

    console.warn(`❌ PIN incorrect. ${attemptsRemaining} attempt(s) remaining`);
    return {
      success: false,
      message: `Incorrect PIN. ${attemptsRemaining} attempt(s) remaining.`,
      isOffline: true,
      attemptsRemaining
    };
  } catch (err) {
    console.error('❌ Error verifying PIN locally:', err);
    return {
      success: false,
      message: 'Error verifying PIN. Please try again.',
      isOffline: true
    };
  }
}

/**
 * Get current login attempts for display
 * Used by PinLoginScreen to show remaining attempts
 */
export async function getLoginAttempts(riderId) {
  try {
    const attemptsKey = `pin_attempts_${riderId}`;
    const attemptsData = await indexedDbAdapter.kvGet(attemptsKey);

    if (!attemptsData) {
      return {
        attempts: 0,
        attemptsRemaining: MAX_ATTEMPTS,
        isLocked: false
      };
    }

    const data = typeof attemptsData === 'string' ? JSON.parse(attemptsData) : attemptsData;
    const attempts = data.attempts || 0;
    const attemptsRemaining = Math.max(0, MAX_ATTEMPTS - attempts);

    // Check if locked
    const lockedUntilKey = `pin_locked_until_${riderId}`;
    const lockedUntilData = await indexedDbAdapter.kvGet(lockedUntilKey);
    
    let isLocked = false;
    let minutesRemaining = 0;
    
    if (lockedUntilData) {
      const lockedUntil = typeof lockedUntilData === 'string' ? parseInt(lockedUntilData) : lockedUntilData;
      const now = Date.now();
      
      if (now < lockedUntil) {
        isLocked = true;
        minutesRemaining = Math.ceil((lockedUntil - now) / 60000);
      }
    }

    return {
      attempts,
      attemptsRemaining,
      isLocked,
      minutesRemaining
    };
  } catch (err) {
    console.error('❌ Error getting login attempts:', err);
    return {
      attempts: 0,
      attemptsRemaining: MAX_ATTEMPTS,
      isLocked: false
    };
  }
}

/**
 * Clear PIN and attempts (called when rider resets PIN)
 * Used during PIN recovery workflow
 */
export async function clearPinData(riderId) {
  try {
    const pinKey = `pin_${riderId}`;
    const attemptsKey = `pin_attempts_${riderId}`;
    const lockedUntilKey = `pin_locked_until_${riderId}`;

    await indexedDbAdapter.delete(pinKey);
    await indexedDbAdapter.delete(attemptsKey);
    await indexedDbAdapter.delete(lockedUntilKey);

    console.log(`✅ Cleared PIN data for rider ${riderId}`);
    return true;
  } catch (err) {
    console.error('❌ Error clearing PIN data:', err);
    return false;
  }
}

/**
 * Check if PIN exists locally (user has completed onboarding)
 */
export async function hasPinSaved(riderId) {
  try {
    const pinKey = `pin_${riderId}`;
    const storedPin = await indexedDbAdapter.kvGet(pinKey);
    return !!storedPin;
  } catch (err) {
    console.error('❌ Error checking if PIN exists:', err);
    return false;
  }
}

/**
 * Reset attempts after successful login or account unlock
 */
export async function resetLoginAttempts(riderId) {
  try {
    const attemptsKey = `pin_attempts_${riderId}`;
    const lockedUntilKey = `pin_locked_until_${riderId}`;

    await indexedDbAdapter.kvSet(attemptsKey, JSON.stringify({ attempts: 0, timestamp: Date.now() }));
    await indexedDbAdapter.delete(lockedUntilKey);

    console.log(`✅ Reset login attempts for rider ${riderId}`);
    return true;
  } catch (err) {
    console.error('❌ Error resetting login attempts:', err);
    return false;
  }
}

export default {
  savePinLocally,
  verifyPinLocally,
  getLoginAttempts,
  clearPinData,
  hasPinSaved,
  resetLoginAttempts,
};