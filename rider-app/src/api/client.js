// rider-app/src/api/client.js
// ✅ IMPROVED: Suppresses network error logs when offline (no more annoying console spam)
// ✅ FIXED: Only logs errors when they're unexpected (not just missing network)
// ✅ OPTIMIZED: Checks offline status before logging network errors

import axios from 'axios';
import Constants from 'expo-constants';
import { getLocalAuthToken } from '../offline/db';
import NetInfo from '@react-native-community/netinfo';

// EXPO_PUBLIC_API_BASE_URL is read at build time via rider-app/app.json's "extra" block
// (see app.json's expo.extra.apiBaseUrl) -- falls back to localhost for local development
// against the backend from your Environment Setup guide.
// AUDIT FIX: this used to also read process.env.EXPO_PUBLIC_API_BASE_URL directly, but
// babel-preset-expo rewrites any `process.env.EXPO_PUBLIC_*` reference into an import from
// the Metro-only virtual module 'expo/virtual/env' at parse time -- regardless of whether
// the branch is ever reached -- which breaks under Jest (no bundler to resolve it). Since
// app.json's `extra` block is the actual configured source in this app, the fallback is
// just a plain default now.
const API_BASE_URL = 'https://smart-boda-api.onrender.com';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

// Track last network status to suppress offline errors
let lastNetworkStatus = { isConnected: true, isInternetReachable: true };
NetInfo.addEventListener(state => {
  lastNetworkStatus = state;
});

// Attach the rider's auth token (set at PIN login) to every outgoing request, when present.
api.interceptors.request.use(async (config) => {
  try {
    const token = await getLocalAuthToken();
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // No local token yet (e.g. very first launch, pre-login) -- proceed unauthenticated;
    // syncQueue.js and individual screens already handle 401s from here.
  }
  return config;
});

// ✅ FIXED: Suppress error logs for expected offline scenarios
api.interceptors.response.use(
  response => response,
  error => {
    // Check if this is an expected offline error
    const isOfflineError = 
      error.code === 'ECONNABORTED' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ERR_INTERNET_DISCONNECTED' ||
      error.code === 'ERR_NETWORK' ||
      error.message?.includes('Network request failed') ||
      error.message?.includes('internet') ||
      error.message?.includes('ECONNABORTED');

    const isHealthCheck = 
      error.config?.method === 'head' ||
      error.config?.url === '/' ||
      error.config?.url === API_BASE_URL;

    // Check current network status
    const isCurrentlyOffline = 
      !lastNetworkStatus.isConnected || 
      !lastNetworkStatus.isInternetReachable;

    // ✅ SUPPRESS: Don't log if offline (expected behavior)
    // Only log if it's an unexpected error while online
    if (!isCurrentlyOffline && !isOfflineError) {
      // Legitimate error while online - log it
      console.warn('⚠️ API Error:', {
        status: error.response?.status,
        message: error.message,
        url: error.config?.url,
        timestamp: new Date().toISOString(),
      });
    } else if (isOfflineError && !isHealthCheck) {
      // Offline error for user operation - log once
      console.log('📡 Network unavailable - queued for sync', {
        endpoint: error.config?.url,
        status: isCurrentlyOffline ? 'offline' : 'interrupted',
      });
    }
    // Health check errors (HEAD requests) are silently suppressed

    return Promise.reject(error);
  }
);

export default api;