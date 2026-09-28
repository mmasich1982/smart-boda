// admin-console/src/api/client.js
// Single shared axios instance with improved error handling and timeouts
// CRITICAL FIX: Removed localStorage token handling (uses httpOnly cookies instead)

import axios from 'axios';

// ============================================================================
// AXIOS CONFIGURATION
// ============================================================================
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'https://smart-boda-api.onrender.com';

console.log(`📡 API Base URL: ${apiBaseUrl}`);

if (!apiBaseUrl) {
  console.error(
    '❌ VITE_API_BASE_URL is not configured. Add it to .env:\n' +
    'VITE_API_BASE_URL=https://smart-boda-api.onrender.com'
  );
}

if (apiBaseUrl && apiBaseUrl.includes('admin.onrender.com')) {
  console.error(
    '❌ VITE_API_BASE_URL points to the frontend, not the backend!\n' +
    'Change from: https://smart-boda-admin.onrender.com\n' +
    'Change to: https://smart-boda-api.onrender.com'
  );
}

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 30000, // Increased to 30s for Render free tier cold starts
  withCredentials: true, // CRITICAL: Required to send/receive httpOnly cookies
  headers: {
    'Content-Type': 'application/json',
  }
});

// ============================================================================
// REQUEST INTERCEPTOR
// ============================================================================
// CRITICAL FIX: Removed localStorage token handling
// Authentication is now done via httpOnly cookies automatically sent by browser
// No need to manually add Authorization header
api.interceptors.request.use(
  (config) => {
    if (import.meta.env.DEV) {
      console.debug(`📤 ${config.method?.toUpperCase()} ${config.url}`);
    }
    return config;
  },
  (error) => {
    console.error('❌ Request preparation failed:', error);
    return Promise.reject(error);
  }
);

// ============================================================================
// RESPONSE INTERCEPTOR - Handle errors gracefully
// ============================================================================
api.interceptors.response.use(
  (response) => {
    if (import.meta.env.DEV) {
      console.debug(`📥 ${response.status} from ${response.config.url}`);
    }
    return response;
  },
  async (error) => {
    const status = error.response?.status;
    const url = error.config?.url;
    const method = error.config?.method?.toUpperCase();

    // ========================================================================
    // TIMEOUT ERRORS
    // ========================================================================
    if (error.code === 'ECONNABORTED') {
      console.error(
        `⏱️ Request timeout (30s) on ${method} ${url}\n` +
        'This often means:\n' +
        '  1. Backend API is sleeping (Render free tier)\n' +
        '  2. Network is slow\n' +
        '  3. Backend is not responding\n' +
        `Check: ${apiBaseUrl}/health`
      );
      error.isTimeout = true;
      return Promise.reject(error);
    }

    // ========================================================================
    // NETWORK ERRORS (No response received)
    // ========================================================================
    if (!error.response) {
      if (error.message === 'Network Error') {
        console.error(
          '❌ Network Error - Cannot reach backend. This could be:\n' +
          '  1. Backend API is not running or not accessible\n' +
          '  2. VITE_API_BASE_URL is incorrect\n' +
          '  3. CORS is not properly configured on backend\n' +
          '  4. Network connectivity issue\n' +
          `  Trying to reach: ${apiBaseUrl}`
        );
        error.isNetworkError = true;
        error.isCORSError = true; // Likely CORS issue
      } else if (error.code === 'ECONNREFUSED') {
        console.error(
          `❌ Connection refused on ${method} ${url}\n` +
          `   Backend at ${apiBaseUrl} is not responding`
        );
        error.isNetworkError = true;
      } else {
        console.error(`❌ Network Error: ${error.message}`);
        error.isNetworkError = true;
      }
      return Promise.reject(error);
    }

    // ========================================================================
    // HTTP ERROR RESPONSES (Got a response, but status indicates error)
    // ========================================================================
    console.error(`❌ API Error: ${status} ${method} ${url}`);
    if (error.response?.data?.detail) {
      console.error(`   Detail: ${error.response.data.detail}`);
    }

    // ========================================================================
    // 401 UNAUTHORIZED - Session expired or invalid
    // ========================================================================
    if (status === 401) {
      console.warn('🔐 Received 401 Unauthorized - Session is invalid or expired');
      console.warn('   Clearing session and redirecting to login...');

      // Import and clear session
      try {
        const { clearSession } = await import('../auth/session');
        clearSession();
      } catch (e) {
        console.error('Could not clear session:', e);
      }

      // Redirect to login if not already there
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }

    // ========================================================================
    // 403 FORBIDDEN - Access denied
    // ========================================================================
    if (status === 403) {
      console.warn('⛔ Access denied (403 Forbidden)');
    }

    // ========================================================================
    // 500+ SERVER ERRORS
    // ========================================================================
    if (status >= 500) {
      console.error(`⚠️ Backend server error (${status}): ${error.response?.data?.detail || error.message}`);
    }

    return Promise.reject(error);
  }
);

export default api;