// admin-console/src/auth/session.js
// CORRECTED: Comprehensive session management with error handling and race condition fixes

import api from '../api/client';

// ============================================================================
// SESSION STATE MANAGEMENT
// ============================================================================

/**
 * Session object structure:
 * {
 *   id: string (UUID),
 *   name: string,
 *   email: string,
 *   role: "super_admin" | "support_admin",
 *   is_active: boolean,
 * }
 */

let sessionState = null;
let sessionCheckInProgress = false;
let sessionInitPromise = null;

// ============================================================================
// CORE SESSION FUNCTIONS
// ============================================================================

/**
 * Initialize session from httpOnly cookie.
 * 
 * FLOW:
 * 1. App loads → calls initSession()
 * 2. Makes GET /admin/auth/me request (cookie auto-sent)
 * 3. Backend validates JWT in cookie
 * 4. If valid: returns admin data, sets sessionState
 * 5. If invalid: returns 401, clears session
 * 
 * CRITICAL FIX: Uses promise caching to prevent race conditions
 * Multiple calls to initSession() return the same promise
 */
export async function initSession() {
  // If already in progress, return the same promise to prevent duplicate requests
  if (sessionInitPromise) {
    console.log('⏳ Session check already in progress, returning existing promise...');
    return sessionInitPromise;
  }

  // Create and store the promise so other calls can await it
  sessionInitPromise = performSessionInit();
  
  return sessionInitPromise;
}

/**
 * Performs the actual session initialization logic
 * This is separated to allow promise caching
 */
async function performSessionInit() {
  sessionCheckInProgress = true;

  try {
    console.log('🔄 Hydrating session from backend...');

    const response = await api.get('/admin/auth/me');

    if (response.status === 200 && response.data) {
      sessionState = response.data;
      console.log(`✓ Session hydrated: ${sessionState.email} (${sessionState.role})`);
      return sessionState;
    }
  } catch (error) {
    const status = error.response?.status;
    const detail = error.response?.data?.detail;

    if (status === 401) {
      console.log('⚠️ Session expired or invalid - user must login');
    } else if (error.isNetworkError) {
      console.error('❌ Network Error - Check if backend is running');
      console.error(`   API Base URL: ${api.defaults.baseURL}`);
      console.error(`   Error: ${error.message}`);
    } else {
      console.error(`❌ Session hydration failed (${status}): ${detail || error.message}`);
    }

    // Clear invalid session
    sessionState = null;
  } finally {
    sessionCheckInProgress = false;
    // Clear the promise cache so a new check can be initiated if needed
    sessionInitPromise = null;
  }

  return null;
}

/**
 * Get current session state.
 * Returns null if not authenticated.
 */
export function getSession() {
  return sessionState;
}

/**
 * Check if user is authenticated.
 */
export function isAuthenticated() {
  return sessionState !== null && sessionState.id !== undefined;
}

/**
 * Check if user has super_admin role.
 */
export function isSuperAdmin() {
  return isAuthenticated() && sessionState.role === 'super_admin';
}

/**
 * Check if user has support_admin or higher role.
 */
export function isAdmin() {
  return isAuthenticated() && ['support_admin', 'super_admin'].includes(sessionState.role);
}

// ============================================================================
// LOGIN / LOGOUT
// ============================================================================

/**
 * Manually set session state.
 * 
 * Used by LoginPage after successful login to update session state.
 * In normal flow, login() function is used instead.
 * 
 * @param {object} data - Session data object {id, name, email, role, is_active}
 */
export function setSession(data) {
  if (data && typeof data === 'object') {
    sessionState = {
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role,
      is_active: data.is_active !== undefined ? data.is_active : true
    };
    console.log(`✓ Session set: ${sessionState.email} (${sessionState.role})`);
  } else {
    console.error('Invalid session data provided to setSession');
  }
}

/**
 * Admin login with email and password.
 * 
 * FLOW:
 * 1. POST /admin/auth/login with credentials
 * 2. Backend validates credentials
 * 3. Backend creates JWT and sets httpOnly cookie
 * 4. Frontend receives admin data
 * 5. Frontend stores admin data in session (not token)
 * 
 * CRITICAL FIX: 
 * - Comprehensive error handling and validation
 * - Clears promise cache on successful login to allow fresh session checks
 * 
 * @param {string} email - Admin email
 * @param {string} password - Admin password
 * @returns {Promise<boolean>} - true if login successful
 */
export async function login(email, password) {
  if (!email || !password) {
    console.error('❌ Email and password are required');
    throw new Error('Missing credentials');
  }

  try {
    console.log('🔐 Attempting login...');

    const response = await api.post('/admin/auth/login', {
      email: email.trim(),
      password: password
    });

    if (response.status === 200 && response.data) {
      const { id, name, email: respEmail, role, is_active } = response.data;

      // Validate response data
      if (!id || !name || !respEmail || !role) {
        console.error('❌ Invalid response from login endpoint');
        throw new Error('Invalid login response');
      }

      // Set session state
      sessionState = {
        id,
        name,
        email: respEmail,
        role,
        is_active
      };

      console.log(`✓ Login successful: ${sessionState.email} (${sessionState.role})`);
      console.log('ℹ️  JWT token is stored in httpOnly cookie (not accessible to JavaScript)');

      return true;
    }
  } catch (error) {
    const status = error.response?.status;
    const detail = error.response?.data?.detail;

    if (status === 401) {
      console.error('❌ Login failed: Invalid email or password');
      throw new Error('Invalid email or password');
    } else if (status === 403) {
      console.error('❌ Login failed: Account disabled');
      throw new Error('Account disabled. Contact administrator.');
    } else if (error.isNetworkError) {
      console.error('❌ Network Error - Cannot reach backend');
      console.error(`   API Base URL: ${api.defaults.baseURL}`);
      console.error(`   Error: ${error.message}`);
      throw new Error('Network error - backend is not responding');
    } else if (error.isCORSError) {
      console.error('❌ CORS Error - Browser blocked the request');
      console.error('   This usually means:');
      console.error('   1. Backend CORS is not configured correctly');
      console.error('   2. withCredentials is true but CORS origin is not specific');
      console.error('   3. Check browser Network tab for details');
      throw new Error('CORS configuration error');
    } else {
      console.error(`❌ Login error (${status}): ${detail || error.message}`);
      throw error;
    }
  }
}

/**
 * Admin logout and clear session.
 * 
 * FLOW:
 * 1. POST /admin/auth/logout (validates session)
 * 2. Backend clears httpOnly cookie
 * 3. Frontend clears sessionState
 * 4. Frontend redirects to login page
 * 
 * CRITICAL FIX: 
 * - Handles logout failures gracefully
 * - Always clears frontend session even if backend call fails
 */
export async function logout() {
  try {
    console.log('🔄 Logging out...');

    await api.post('/admin/auth/logout');

    console.log('✓ Logout successful');
  } catch (error) {
    // Even if logout fails on backend, clear frontend session
    console.warn(`⚠️  Logout request failed: ${error.message}, clearing frontend session anyway`);
  } finally {
    // Always clear session state
    clearSession();
  }
}

/**
 * Clear session state (called on logout or when session expires).
 * Also clears the promise cache to allow fresh session checks on next init.
 */
export function clearSession() {
  sessionState = null;
  sessionCheckInProgress = false;
  sessionInitPromise = null;
  console.log('✓ Session cleared');
}

// ============================================================================
// HELPER FUNCTIONS - Used by UI components
// ============================================================================

/**
 * Get current admin's name.
 * Returns empty string if not authenticated.
 * Used by Sidebar.jsx to display admin name.
 */
export function currentAdminName() {
  return sessionState?.name || '';
}

/**
 * Get current admin's role.
 * Returns empty string if not authenticated.
 * Used by Sidebar.jsx to display admin role.
 */
export function currentAdminRole() {
  return sessionState?.role || '';
}

/**
 * Get current admin's email.
 * Returns empty string if not authenticated.
 */
export function currentAdminEmail() {
  return sessionState?.email || '';
}

/**
 * Get current admin's ID.
 * Returns null if not authenticated.
 */
export function currentAdminId() {
  return sessionState?.id || null;
}

// ============================================================================
// BACKWARD COMPATIBILITY ALIASES
// ============================================================================
// These aliases maintain compatibility with existing code that uses different names

/**
 * Alias for isAuthenticated() - used by App.jsx
 */
export function isLoggedIn() {
  return isAuthenticated();
}

/**
 * Alias for initSession() - used by App.jsx
 */
export async function hydrateSession() {
  return initSession();
}

// ============================================================================
// DEBUG HELPERS
// ============================================================================

/**
 * Log current session state (for debugging).
 * Available as window.__debugSession() in browser console.
 */
export function debugSession() {
  console.group('🐛 Session Debug Info');
  console.log('Current Session:', sessionState);
  console.log('API Base URL:', api.defaults.baseURL);
  console.log('Axios withCredentials:', api.defaults.withCredentials);
  console.log('Cookies:', document.cookie ? 'Present' : 'None');
  console.log('Session check in progress:', sessionCheckInProgress);
  console.log('Session init promise:', sessionInitPromise ? 'Active' : 'None');
  console.groupEnd();

  return {
    session: sessionState,
    apiUrl: api.defaults.baseURL,
    withCredentials: api.defaults.withCredentials,
    isCheckInProgress: sessionCheckInProgress
  };
}

// ============================================================================
// EXPORT DEBUG FUNCTION TO WINDOW
// ============================================================================

if (typeof window !== 'undefined') {
  window.__debugSession = debugSession;
  window.__getSession = getSession;
  window.__isAuthenticated = isAuthenticated;
  window.__currentAdminName = currentAdminName;
  window.__currentAdminRole = currentAdminRole;
}