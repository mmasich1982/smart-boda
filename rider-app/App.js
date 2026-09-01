// rider-app/App.js
// ✅ ULTRA-SAFE VERSION - Handles undefined strings gracefully
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { LocalizationProvider, useTranslation } from './src/i18n/LocalizationProvider';
import { ToastProvider } from './src/components/Toast';
import { RiderProvider } from './src/rider/RiderContext';
import OnboardingNavigator from './src/navigation/OnboardingNavigator';
import { startSyncMonitor } from './src/offline/syncQueue';
import { registerServiceWorker } from './src/pwa/registerServiceWorker';
import InstallPrompt from './src/pwa/InstallPrompt';

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
  },
  spinnerWrapper: {
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#666',
  },
  debugText: {
    marginTop: 8,
    fontSize: 11,
    color: '#999',
    fontFamily: 'monospace',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#d32f2f',
    textAlign: 'center',
    marginBottom: 16,
  },
  errorDetail: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
});

/**
 * ✅ MANDATORY: Loading Splash Screen
 * Shows while translations are loading
 */
function LoadingSplash({ loadingStatus }) {
  const statusMessages = {
    initializing: 'Initializing...',
    loading: 'Loading translations...',
    cached: 'Using cached translations...',
    fresh: 'Syncing translations...',
    error: 'Using fallback translations...',
  };

  return (
    <View style={styles.loadingContainer}>
      <View style={styles.spinnerWrapper}>
        <ActivityIndicator size="large" color="#1976d2" />
        <Text style={styles.loadingText}>
          {statusMessages[loadingStatus] || 'Loading...'}
        </Text>
        <Text style={styles.debugText}>
          Status: {loadingStatus}
        </Text>
      </View>
    </View>
  );
}

/**
 * ✅ ERROR: Fallback Error Screen
 */
function ErrorScreen() {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorText}>⚠️ Failed to Load App</Text>
      <Text style={styles.errorDetail}>
        The app encountered an error while loading translations.{'\n'}
        Please ensure en-fallback.json is in src/i18n/ directory.{'\n\n'}
        Restart the app or check your internet connection.
      </Text>
    </View>
  );
}

/**
 * ✅ MANDATORY: Main App Content
 * Only renders after translations are loaded
 * Enforces isReady check before showing anything
 */
function AppContent() {
  const { isReady, languageCode, strings, loadingStatus } = useTranslation();

  // ✅ LOADING STATE: Show splash until ready
  if (!isReady) {
    return <LoadingSplash loadingStatus={loadingStatus} />;
  }

  // ✅ ULTRA-SAFE: Check if strings exists and is an object
  if (!strings || typeof strings !== 'object') {
    console.error('[App] ❌ Strings is not an object:', typeof strings, strings);
    return <ErrorScreen />;
  }

  // ✅ SAFE: Get keys safely
  let stringsCount = 0;
  try {
    stringsCount = Object.keys(strings).length;
  } catch (err) {
    console.error('[App] Error counting string keys:', err);
    return <ErrorScreen />;
  }

  // ✅ SAFETY CHECK: Verify translations loaded
  const hasCriticalStrings = 
    strings['preview.earned_label'] && 
    strings['home.running_total'] && 
    stringsCount > 10; // At least 10 keys

  console.log('[App] ✅ Render ready:', {
    language: languageCode,
    stringsLoaded: stringsCount,
    hasCriticalStrings,
    loadingStatus,
    timestamp: new Date().toISOString(),
  });

  // ✅ ERROR STATE: Critical strings missing
  if (!hasCriticalStrings) {
    console.error('[App] ❌ Critical translations missing!', {
      stringsCount,
      missing: {
        earned_label: !strings['preview.earned_label'],
        running_total: !strings['home.running_total'],
      },
    });
    return <ErrorScreen />;
  }

  // ✅ Initialize sync & PWA after verified ready
  try {
    startSyncMonitor();
    console.log('[App] ✅ Sync monitor started');
  } catch (err) {
    console.warn('[App] Failed to start sync monitor:', err);
  }

  try {
    registerServiceWorker();
    console.log('[App] ✅ Service worker registered (PWA support)');
  } catch (err) {
    console.warn('[App] Service worker registration failed:', err);
  }

  // ✅ SUCCESS: Render main app
  return (
    <RiderProvider>
      <ToastProvider>
        <OnboardingNavigator />
        <InstallPrompt />
      </ToastProvider>
    </RiderProvider>
  );
}

/**
 * ✅ ROOT: Main App Component
 * Wraps everything with LocalizationProvider
 * This ensures translations are available before anything renders
 */
export default function App() {
  return (
    <LocalizationProvider>
      <AppContent /> {/* ← Enforces isReady check */}
    </LocalizationProvider>
  );
}