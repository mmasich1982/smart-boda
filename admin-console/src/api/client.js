// admin-console/src/api/client.js
// Single shared axios instance with improved error handling and timeouts
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
  withCredentials: true, // Important: send cookies with requests
  headers: {
    'Content-Type': 'application/json',
  }
});

// ============================================================================
// REQUEST INTERCEPTOR - Add auth token
// ============================================================================
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('adminToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
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
    
    // Handle timeout errors
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
    
    // Log error details
    console.error(`❌ API Error: ${status} on ${method} ${url}`);
    if (error.response?.data?.detail) {
      console.error(`   Detail: ${error.response.data.detail}`);
    }
    
    // Handle 401 Unauthorized - clear session and redirect to login
    if (status === 401) {
      const { clearSession } = await import('../auth/session');
      clearSession();
      
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        console.warn('🔐 Session expired. Redirecting to login...');
        window.location.assign('/login');
      }
    }
    
    // Handle 403 Forbidden
    if (status === 403) {
      console.warn('⛔ Access denied (403 Forbidden)');
    }
    
    // Handle network errors and CORS issues
    if (error.message === 'Network Error' && !error.response) {
      console.error(
        '❌ Network Error - Check if:\n' +
        '  1. Backend API is running and accessible\n' +
        '  2. VITE_API_BASE_URL is correct\n' +
        '  3. CORS is properly configured on backend\n' +
        `  4. Trying to reach: ${apiBaseUrl}`
      );
      error.isNetworkError = true;
    }
    
    return Promise.reject(error);
  }
);

export default api;