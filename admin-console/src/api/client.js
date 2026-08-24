// admin-console/src/api/client.js
// Single shared axios instance for the whole Admin Console. Every other file under
// api/ imports `api` from here instead of creating its own axios.create() call, so
// baseURL, credentials, and error handling are consistent everywhere.
import axios from 'axios';

// ============================================================================
// AXIOS CONFIGURATION - FIXED
// ============================================================================
// CRITICAL FIX: Validate that API base URL is configured correctly
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

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

console.log(`📡 API Base URL: ${apiBaseUrl}`);

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15000,
  // AUDIT FIX (Admin Console §2, High): the auth token now lives in an httpOnly cookie
  // issued by the backend (see backend/app/auth.py) instead of localStorage -- this just
  // tells the browser to send/accept that cookie on cross-origin requests. No token is
  // ever read or attached by JS here.
  withCredentials: false,
});

// Add this NEW block (after axios.create, before interceptors):
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('adminToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ============================================================================
// REQUEST INTERCEPTOR - Add debugging for failed requests
// ============================================================================
api.interceptors.request.use(
  (config) => {
    // Log outgoing requests in development
    if (import.meta.env.DEV) {
      console.debug(`📤 ${config.method?.toUpperCase()} ${config.url}`);
    }
    return config;
  },
  (error) => {
    console.error('❌ Request failed:', error);
    return Promise.reject(error);
  }
);

// ============================================================================
// RESPONSE INTERCEPTOR - Handle 401 and other errors
// ============================================================================
// If the backend ever says the session is no longer valid, clear it locally and
// bounce back to the login screen rather than leaving the admin looking at a
// silently-broken page. clearSession is imported lazily to avoid a circular import
// with session.js (which itself imports `api` from this file).
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
    
    // Log error details
    console.error(`❌ API Error: ${status} on ${error.config?.method?.toUpperCase()} ${url}`);
    if (error.response?.data?.detail) {
      console.error(`   Detail: ${error.response.data.detail}`);
    }
    
    // Handle 401 Unauthorized - clear session and redirect to login
    if (status === 401) {
      const { clearSession } = await import('../auth/session');
      clearSession();
      
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        console.warn('🔐 Session expired or invalid. Redirecting to login...');
        window.location.assign('/login');
      }
    }
    
    // Handle 403 Forbidden - user doesn't have permission
    if (status === 403) {
      console.warn('⛔ Access denied (403 Forbidden)');
    }
    
    // Handle CORS errors
    if (error.message === 'Network Error' && !error.response) {
      console.error(
        '❌ Network Error - Check if:\n' +
        '  1. Backend API is running and accessible\n' +
        '  2. VITE_API_BASE_URL is correct\n' +
        '  3. CORS is properly configured on backend\n' +
        `  4. Trying to reach: ${apiBaseUrl}`
      );
    }
    
    return Promise.reject(error);
  }
);


export default api;
