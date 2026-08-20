// rider-app/src/offline/db.js
// ✅ Offline-First: Core offline database for rider credentials

import LocalStore from './LocalStore';

const RIDER_ID_KEY = 'rider_id';
const RIDER_CREDENTIALS_KEY = 'rider_credentials';
const APP_INITIALIZED_KEY = 'app_initialized';

// Get locally stored rider ID
export const getLocalRiderId = () => {
  try {
    const riderId = LocalStore.get(RIDER_ID_KEY);
    if (!riderId) {
      throw new Error('Rider ID not found in local storage');
    }
    console.log(`✅ Loaded rider ID from offline storage: ${riderId}`);
    return riderId;
  } catch (err) {
    console.error('Error loading rider ID:', err);
    return null;
  }
};

// Save rider ID locally after onboarding/login
export const setLocalRiderId = (riderId) => {
  try {
    if (!riderId) {
      throw new Error('Rider ID is required');
    }
    LocalStore.set(RIDER_ID_KEY, riderId);
    console.log(`✅ Saved rider ID to offline storage: ${riderId}`);
    return true;
  } catch (err) {
    console.error('Error saving rider ID:', err);
    return false;
  }
};

// Get stored credentials
export const getLocalCredentials = () => {
  try {
    const credentials = LocalStore.get(RIDER_CREDENTIALS_KEY);
    if (credentials) {
      return JSON.parse(credentials);
    }
    return null;
  } catch (err) {
    console.error('Error loading credentials:', err);
    return null;
  }
};

// Save credentials for offline access
export const setLocalCredentials = (credentials) => {
  try {
    if (!credentials || !credentials.riderId) {
      throw new Error('Valid credentials with riderId required');
    }
    LocalStore.set(RIDER_CREDENTIALS_KEY, JSON.stringify(credentials));
    console.log('✅ Saved credentials to offline storage');
    return true;
  } catch (err) {
    console.error('Error saving credentials:', err);
    return false;
  }
};

// Check if app has been initialized
export const isAppInitialized = () => {
  try {
    const initialized = LocalStore.get(APP_INITIALIZED_KEY);
    return initialized === 'true';
  } catch (err) {
    return false;
  }
};

// Mark app as initialized
export const setAppInitialized = () => {
  try {
    LocalStore.set(APP_INITIALIZED_KEY, 'true');
    console.log('✅ App marked as initialized');
    return true;
  } catch (err) {
    console.error('Error marking app as initialized:', err);
    return false;
  }
};

// Clear all local data
export const clearAllLocalData = () => {
  try {
    LocalStore.remove(RIDER_ID_KEY);
    LocalStore.remove(RIDER_CREDENTIALS_KEY);
    LocalStore.remove(APP_INITIALIZED_KEY);
    console.log('✅ Cleared all offline data');
    return true;
  } catch (err) {
    console.error('Error clearing local data:', err);
    return false;
  }
};