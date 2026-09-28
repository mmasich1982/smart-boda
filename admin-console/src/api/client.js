// admin-console/src/api/client.js
// Single shared axios instance with improved error handling and timeouts
// CRITICAL FIX: Removed localStorage token handling (uses httpOnly cookies instead)

import axios from 'axios';

// ============================================================================
// AXIOS CONFIGURATION
// ============================================================================
// Event fired on any unexpected 401 so the router (not the browser) handles the redirect.
export const AUTH_UNAUTHORIZED_EVENT = 'auth:unauthorized';

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
    // ROOT-CAUSE FIX: this used to call window.location.assign('/login'), a HARD
    // browser navigation. While React Router was already rendering <LoginPage/>
    // client-side, the browser then requested GET /login from the static host,
    // which has no such file and answered "Not Found" -- so the login page
    // flashed for a few milliseconds and was replaced by a blank "Not Found".
    //
    // Now the interceptor never navigates. It only broadcasts an event; the
    // <SessionWatcher/> inside <BrowserRouter> (App.jsx) clears the session and
    // does a client-side navigate('/login'), which needs no server round-trip.
    //
    // The two auth-bootstrap calls are excluded: a 401 from /admin/auth/me on
    // page load just means "not logged in yet", and a 401 from /admin/auth/login
    // means "wrong password" -- both are handled by their callers.
    if (status === 401) {
      const isAuthBootstrapCall =
        typeof url === 'string' &&
        (url.includes('/admin/auth/me') || url.includes('/admin/auth/login'));

      if (!isAuthBootstrapCall && typeof window !== 'undefined') {
        console.warn('🔐 Received 401 Unauthorized - session invalid or expired');
        window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT));
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