// admin-console/src/auth/session.js
// AUDIT FIX (Admin Console §2, High): "Auth token kept in localStorage, readable by any
// injected script." The token itself is no longer handled by the frontend at all -- the
// backend now issues it in an httpOnly/Secure/SameSite=Lax cookie (see
// backend/app/auth.py), which JS can't read even if it wanted to. Only non-sensitive
// display data (name, role) is kept here, in memory, and re-hydrated from the backend's
// /admin/auth/me on page load so a refresh doesn't lose it.
import api from '../api/client';

let currentAdmin = null; // { id, name, role, email, is_active } | null
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn(currentAdmin));
}

export function subscribeSession(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setSession(admin) {
  currentAdmin = admin;
  console.log(`✓ Session set for: ${admin.name} (${admin.role})`);
  notify();
}

export function clearSession() {
  if (currentAdmin) {
    console.log(`✓ Session cleared for: ${currentAdmin.email}`);
  }
  currentAdmin = null;
  notify();
}

export function currentAdminName() {
  return currentAdmin?.name || 'Admin';
}

export function currentAdminRole() {
  return currentAdmin?.role || null;
}

export function currentAdminId() {
  return currentAdmin?.id || null;
}

export function isLoggedIn() {
  return Boolean(currentAdmin);
}

// ============================================================================
// HYDRATE SESSION
// ============================================================================
// Called once at app startup (see App.jsx) to recover session state from the httpOnly
// cookie the backend already has, without ever touching the token itself.
export async function hydrateSession() {
  try {
    console.log('🔄 Hydrating session from backend...');
    const { data } = await api.get('/admin/auth/me');
    
    console.log(`✓ Session hydrated: ${data.name} (${data.role})`);
    setSession(data);
    return data;
  } catch (error) {
    // This is expected if user is not logged in
    if (error.response?.status === 401) {
      console.log('ℹ️ No active session (user not logged in)');
    } else {
      console.warn('⚠️ Session hydration failed:', error.message);
    }
    clearSession();
    return null;
  }
}

// ============================================================================
// LOGOUT
// ============================================================================
export async function logout() {
  try {
    console.log('🚪 Logging out...');
    await api.post('/admin/auth/logout');
    console.log('✓ Logout API call succeeded');
  } catch (error) {
    console.warn('⚠️ Logout API error (but clearing session anyway):', error.message);
  } finally {
    clearSession();
  }
}

// ============================================================================
// DEBUG UTILITIES
// ============================================================================
export function debugSession() {
  console.log('=== Session Debug Info ===');
  console.log('Current Admin:', currentAdmin);
  console.log('Is Logged In:', isLoggedIn());
  console.log('Admin Name:', currentAdminName());
  console.log('Admin Role:', currentAdminRole());
  console.log('Active Listeners:', listeners.size);
}

// Expose debug function globally for easy access in browser console
if (typeof window !== 'undefined') {
  window.__debugSession = debugSession;
  console.log('💡 Debug tip: Call window.__debugSession() in console to see session state');
}
