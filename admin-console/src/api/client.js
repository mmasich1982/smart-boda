// admin-console/src/api/client.js
// Single shared axios instance for the whole Admin Console. Every other file under
// api/ imports `api` from here instead of creating its own axios.create() call, so
// baseURL, credentials, and error handling are consistent everywhere.
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
  // AUDIT FIX (Admin Console §2, High): the auth token now lives in an httpOnly cookie
  // issued by the backend (see backend/app/auth.py) instead of localStorage -- this just
  // tells the browser to send/accept that cookie on cross-origin requests. No token is
  // ever read or attached by JS here.
  withCredentials: true,
});

// If the backend ever says the session is no longer valid, clear it locally and
// bounce back to the login screen rather than leaving the admin looking at a
// silently-broken page. clearSession is imported lazily to avoid a circular import
// with session.js (which itself imports `api` from this file).
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response && error.response.status === 401) {
      const { clearSession } = await import('../auth/session');
      clearSession();
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
