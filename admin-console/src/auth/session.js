// admin-console/src/auth/session.js
// AUDIT FIX (Admin Console §2, High): "Auth token kept in localStorage, readable by any
// injected script." The token itself is no longer handled by the frontend at all -- the
// backend now issues it in an httpOnly/Secure/SameSite=Strict cookie (see
// backend/app/auth.py), which JS can't read even if it wanted to. Only non-sensitive
// display data (name, role) is kept here, in memory, and re-hydrated from the backend's
// /admin/auth/me on page load so a refresh doesn't lose it.
import api from '../api/client';

let currentAdmin = null; // { name, role, email } | null
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
  notify();
}

export function clearSession() {
  currentAdmin = null;
  notify();
}

export function currentAdminName() {
  return currentAdmin?.name || 'Admin';
}

export function currentAdminRole() {
  return currentAdmin?.role || null;
}

export function isLoggedIn() {
  return Boolean(currentAdmin);
}

// Called once at app startup (see App.jsx) to recover session state from the httpOnly
// cookie the backend already has, without ever touching the token itself.
export async function hydrateSession() {
  try {
    const { data } = await api.get('/admin/auth/me');
    setSession(data);
    return data;
  } catch {
    clearSession();
    return null;
  }
}

export async function logout() {
  try {
    await api.post('/admin/auth/logout');
  } finally {
    clearSession();
  }
}
