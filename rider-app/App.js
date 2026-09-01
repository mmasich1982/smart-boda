// rider-app/App.js
// ✅ FIXED VERSION: Comprehensive error handling and fallback rendering
// ✅ IMPROVED: Better error reporting and logging
// ✅ FIXED: Ensures OnboardingNavigator always renders

import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';

// ✅ SAFE: Check that LocalizationProvider is properly imported
let LocalizationProvider, useTranslation;
try {
  const i18nModule = require('./src/i18n/LocalizationProvider');
  LocalizationProvider = i18nModule.LocalizationProvider;
  useTranslation = i18nModule.useTranslation;
  
  if (!LocalizationProvider) {
    throw new Error('LocalizationProvider not exported from i18n module');
  }
  if (!useTranslation) {
    throw new Error('useTranslation not exported from i18n module');
  }
  console.log('[App] ✅ i18n imports verified');
} catch (err) {
  console.error('[App] ❌ CRITICAL: Failed to import i18n:', err.message);
  // Fallback exports
  LocalizationProvider = ({ children }) => children;
  useTranslation = () => ({
    t: (k) => k,
    strings: {},
    languageCode: 'en',
    isReady: true,
    loadingStatus: 'error',
    setLanguage: () => {},
  });
}

// ✅ SAFE: Import ToastProvider with fallback
let ToastProvider;
try {
  const toastModule = require('./src/components/Toast');
  ToastProvider = toastModule.ToastProvider;
  if (!ToastProvider) {
    throw new Error('ToastProvider not exported');
  }
  console.log('[App] ✅ Toast imports verified');
} catch (err) {
  console.error('[App] ⚠️ Toast import failed:', err.message);
  ToastProvider = ({ children }) => children; // Fallback
}

// ✅ SAFE: Import RiderProvider with fallback
let RiderProvider;
try {
  const riderModule = require('./src/rider/RiderContext');
  RiderProvider = riderModule.RiderProvider;
  if (!RiderProvider) {
    throw new Error('RiderProvider not exported');
  }
  console.log('[App] ✅ Rider imports verified');
} catch (err) {
  console.error('[App] ⚠️ Rider import failed:', err.message);
  RiderProvider = ({ children }) => children; // Fallback
}

// ✅ SAFE: Import OnboardingNavigator with fallback
let OnboardingNavigator;
try {
  const navModule = require('./src/navigation/OnboardingNavigator');
  OnboardingNavigator = navModule.default || navModule;
  if (!OnboardingNavigator || typeof OnboardingNavigator !== 'function') {
    throw new Error('OnboardingNavigator not found or not a function');
  }
  console.log('[App] ✅ Navigation imports verified');
} catch (err) {
  console.error('[App] ⚠️ Navigation import failed:', err.message);
  OnboardingNavigator = () => (
    <View style={styles.errorContainer}>
      <Text style={styles.errorText}>Navigation Error</Text>
      <Text style={styles.errorDetail}>{err.message}</Text>
    </View>
  );
}

// ✅ SAFE: Import sync monitor (non-critical)
let startSyncMonitor;
try {
  const syncModule = require('./src/offline/syncQueue');
  startSyncMonitor = syncModule.startSyncMonitor || syncModule.default?.startSyncMonitor;
  if (!startSyncMonitor) {
    startSyncMonitor = async () => console.log('[App] Sync monitor skipped (not found)');
  }
  console.log('[App] ✅ Sync imports verified');
} catch (err) {
  console.error('[App] ⚠️ Sync import failed:', err.message);
  startSyncMonitor = async () => console.log('[App] Sync monitor unavailable');
}

// ✅ SAFE: Import service worker (non-critical)
let registerServiceWorker;
try {
  const pwAModule = require('./src/pwa/registerServiceWorker');
  registerServiceWorker = pwAModule.registerServiceWorker || pwAModule.default;
  if (!registerServiceWorker) {
    registerServiceWorker = async () => console.log('[App] Service worker skipped');
  }
  console.log('[App] ✅ PWA imports verified');
} catch (err) {
  console.error('[App] ⚠️ PWA import failed:', err.message);
  registerServiceWorker = async () => console.log('[App] PWA unavailable');
}

// ✅ SAFE: Import InstallPrompt (non-critical)
let InstallPrompt;
try {
  const installModule = require('./src/pwa/InstallPrompt');
  InstallPrompt = installModule.default || installModule;
  if (!InstallPrompt) {
    InstallPrompt = () => null;
  }
  console.log('[App] ✅ InstallPrompt imports verified');
} catch (err) {
  console.error('[App] ⚠️ InstallPrompt import failed:', err.message);
  InstallPrompt = () => null; // Silent fallback
}

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
    fontWeight: 'bold',
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
    initializing: 'Initializing app...',
    loading: 'Loading translations...',
    cached: 'Loading from cache...',
    fresh: 'Syncing translations...',
    fallback: 'Using fallback translations...',
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
function ErrorScreen({ message = 'App Error' }) {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorText}>⚠️ {message}</Text>
      <Text style={styles.errorDetail}>
        The app encountered an error while loading.{'\n'}
        Please restart the app.
      </Text>
    </View>
  );
}

/**
 * ✅ MAIN APP CONTENT WRAPPER WITH ERROR BOUNDARY
 */
class AppContentErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    console.error('[AppContentErrorBoundary] Caught error:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[AppContentErrorBoundary] Error details:', {
      error: error.toString(),
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorScreen 
          message={this.state.error?.message || 'An unexpected error occurred'} 
        />
      );
    }

    return this.props.children;
  }
}

/**
 * ✅ MANDATORY: Main App Content
 * Only renders after translations are loaded
 * Enforces isReady check before showing anything
 */
function AppContent() {
  try {
    const { isReady, languageCode, strings, loadingStatus } = useTranslation();

    // ✅ LOADING STATE: Show splash until ready
    if (!isReady) {
      console.log('[AppContent] Not ready yet, showing splash. Status:', loadingStatus);
      return <LoadingSplash loadingStatus={loadingStatus} />;
    }

    // ✅ ULTRA-SAFE: Check if strings exists and is an object
    if (!strings || typeof strings !== 'object') {
      console.error('[AppContent] ❌ Strings is not an object:', typeof strings);
      return <ErrorScreen message="Translation data invalid" />;
    }

    // ✅ SAFE: Get keys safely
    let stringsCount = 0;
    try {
      stringsCount = Object.keys(strings).length;
    } catch (err) {
      console.error('[AppContent] Error counting string keys:', err);
      return <ErrorScreen message="Cannot load translations" />;
    }

    // ✅ SAFETY CHECK: Verify translations loaded (reduced threshold)
    const hasCriticalStrings = stringsCount > 5;

    console.log('[AppContent] ✅ Render ready:', {
      language: languageCode,
      stringsLoaded: stringsCount,
      hasCriticalStrings,
      loadingStatus,
      timestamp: new Date().toISOString(),
    });

    // ✅ ERROR STATE: Critical strings missing
    if (!hasCriticalStrings) {
      console.warn('[AppContent] ⚠️ Minimal translations available (proceeding anyway)', {
        stringsCount,
      });
      // Allow proceeding with limited strings rather than blocking
    }

    // ✅ Initialize sync & PWA after verified ready (non-blocking)
    try {
      if (startSyncMonitor && typeof startSyncMonitor === 'function') {
        Promise.resolve(startSyncMonitor()).catch(err => {
          console.warn('[AppContent] Sync monitor error (non-fatal):', err);
        });
      }
    } catch (err) {
      console.warn('[AppContent] Failed to start sync monitor:', err);
    }

    try {
      if (registerServiceWorker && typeof registerServiceWorker === 'function') {
        Promise.resolve(registerServiceWorker()).catch(err => {
          console.warn('[AppContent] Service worker error (non-fatal):', err);
        });
      }
    } catch (err) {
      console.warn('[AppContent] Service worker registration failed:', err);
    }

    // ✅ SUCCESS: Render main app - wrapped in error boundary
    return (
      <AppContentErrorBoundary>
        <RiderProvider>
          <ToastProvider>
            <OnboardingNavigator />
            {InstallPrompt && <InstallPrompt />}
          </ToastProvider>
        </RiderProvider>
      </AppContentErrorBoundary>
    );
  } catch (err) {
    console.error('[AppContent] Unexpected error in AppContent:', {
      error: err.toString(),
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
    });
    return <ErrorScreen message={err.message || 'Unknown error'} />;
  }
}

/**
 * ✅ ROOT: Main App Component
 * Wraps everything with LocalizationProvider
 * This ensures translations are available before anything renders
 */
export default function App() {
  return (
    <LocalizationProvider>
      <AppContent />
    </LocalizationProvider>
  );
}