// rider-app/src/offline/db.js
// ✅ CORRECTED: Works with synchronous LocalStore

import LocalStore from './LocalStore';

const RIDER_ID_KEY = 'rider_id';
const RIDER_CREDENTIALS_KEY = 'rider_credentials';
const RIDER_PHONE_KEY = 'rider_phone';
const APP_INITIALIZED_KEY = 'app_initialized';

/**
 * Get locally stored rider ID - SYNCHRONOUS
 */
export const getLocalRiderId = () => {
  try {
    const riderId = LocalStore.get(RIDER_ID_KEY);
    
    if (!riderId) {
      console.warn('⚠️ Rider ID not found in offline storage');
      return null;
    }
    
    console.log(`✅ Loaded rider ID: ${riderId}`);
    return riderId;
  } catch (err) {
    console.error('❌ Error loading rider ID:', err);
    return null;
  }
};

/**
 * Save rider ID locally after onboarding/login
 */
export const setLocalRiderId = (riderId) => {
  try {
    if (!riderId) {
      throw new Error('Rider ID is required');
    }
    
    const success = LocalStore.set(RIDER_ID_KEY, String(riderId));
    
    if (success) {
      console.log(`✅ Saved rider ID: ${riderId}`);
    } else {
      console.error('❌ Failed to save rider ID');
    }
    
    return success;
  } catch (err) {
    console.error('❌ Error saving rider ID:', err);
    return false;
  }
};

/**
 * Get stored rider phone number
 */
export const getLocalRiderPhone = () => {
  try {
    const phone = LocalStore.get(RIDER_PHONE_KEY);
    if (phone) {
      console.log(`✅ Loaded rider phone`);
    }
    return phone;
  } catch (err) {
    console.error('❌ Error loading rider phone:', err);
    return null;
  }
};

/**
 * Save rider phone number
 */
export const setLocalRiderPhone = (phone) => {
  try {
    if (!phone) {
      throw new Error('Phone is required');
    }
    
    const success = LocalStore.set(RIDER_PHONE_KEY, String(phone));
    if (success) {
      console.log(`✅ Saved rider phone`);
    }
    return success;
  } catch (err) {
    console.error('❌ Error saving rider phone:', err);
    return false;
  }
};

/**
 * Get stored credentials
 */
export const getLocalCredentials = () => {
  try {
    const credentialsStr = LocalStore.get(RIDER_CREDENTIALS_KEY);
    
    if (!credentialsStr) {
      return null;
    }
    
    try {
      const credentials = JSON.parse(credentialsStr);
      console.log(`✅ Loaded credentials for rider: ${credentials.riderId}`);
      return credentials;
    } catch (parseErr) {
      console.error('❌ Failed to parse credentials:', parseErr);
      return null;
    }
  } catch (err) {
    console.error('❌ Error loading credentials:', err);
    return null;
  }
};

/**
 * Save credentials for offline access
 */
export const setLocalCredentials = (credentials) => {
  try {
    if (!credentials || !credentials.riderId) {
      throw new Error('Valid credentials with riderId required');
    }
    
    const success = LocalStore.set(
      RIDER_CREDENTIALS_KEY,
      JSON.stringify(credentials)
    );
    
    if (success) {
      console.log(`✅ Saved credentials`);
    }
    
    return success;
  } catch (err) {
    console.error('❌ Error saving credentials:', err);
    return false;
  }
};

/**
 * Check if app has been initialized
 */
export const isAppInitialized = () => {
  try {
    const initialized = LocalStore.get(APP_INITIALIZED_KEY);
    return initialized === 'true';
  } catch (err) {
    console.error('❌ Error checking app initialization:', err);
    return false;
  }
};

/**
 * Mark app as initialized
 */
export const setAppInitialized = () => {
  try {
    const success = LocalStore.set(APP_INITIALIZED_KEY, 'true');
    if (success) {
      console.log('✅ App marked as initialized');
    }
    return success;
  } catch (err) {
    console.error('❌ Error marking app as initialized:', err);
    return false;
  }
};

/**
 * Clear all local data (for logout)
 */
export const clearAllLocalData = () => {
  try {
    LocalStore.remove(RIDER_ID_KEY);
    LocalStore.remove(RIDER_CREDENTIALS_KEY);
    LocalStore.remove(RIDER_PHONE_KEY);
    LocalStore.remove(APP_INITIALIZED_KEY);
    console.log('✅ Cleared all offline data');
    return true;
  } catch (err) {
    console.error('❌ Error clearing local data:', err);
    return false;
  }
};

/**
 * Test offline storage
 */
export const testOfflineStorage = () => {
  try {
    console.log('\n🧪 Testing offline storage...');
    
    // Test write
    const testId = 'test_' + Date.now();
    LocalStore.set('storage_test', testId);
    
    // Test read
    const retrieved = LocalStore.get('storage_test');
    
    // Test delete
    LocalStore.remove('storage_test');
    
    const success = retrieved === testId;
    console.log(success ? '✅ Storage test PASSED' : '❌ Storage test FAILED');
    
    return success;
  } catch (err) {
    console.error('❌ Storage test error:', err);
    return false;
  }
};