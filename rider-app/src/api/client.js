// rider-app/src/api/client.js
// This file is imported by 33+ screens and modules across the codebase (syncQueue.js,
// useMasterData.js, every financialPerformance/complianceHistory/settings screen that
// talks to the backend) but was never actually created in any of the five developer
// guides -- see docs/NAVIGATION_VALIDATION_REPORT.md. Without this file, the app cannot
// build at all. Implemented here as a single shared axios instance, mirroring the pattern
// already used by the Admin Console's api/client.js.
import axios from 'axios';
import Constants from 'expo-constants';
import { getLocalAuthToken } from '../offline/db';

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

export default api;
