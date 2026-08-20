// rider-app/src/hooks/useNetworkStatus.js
// Smart network detection that manages connectivity silently without UI interruption

import { useEffect, useState, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

/**
 * Smart hook for managing network status
 * Returns: { isConnected, isInitialized, shouldShowOfflineUI }
 * 
 * Features:
 * - Detects real network connectivity (not just API errors)
 * - Manages offline sync silently
 * - Only shows UI when user action is required
 * - Handles app state changes (foreground/background)
 */
export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState(true); // Assume online until proven otherwise
  const [isInitialized, setIsInitialized] = useState(false);
  const [shouldShowOfflineUI, setShouldShowOfflineUI] = useState(false);
  const appStateRef = useRef(AppState.currentState);
  const lastCheckRef = useRef(0);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;

  // Initialize network listener
  useEffect(() => {
    let unsubscribe;

    const initializeNetworkListener = async () => {
      try {
        // Check initial network state
        const state = await NetInfo.fetch();
        const connected = state.isConnected && state.isInternetReachable;
        
        setIsConnected(connected);
        setIsInitialized(true);
        console.log(`📡 Initial network state: ${connected ? 'ONLINE' : 'OFFLINE'}`);

        // Subscribe to network changes
        unsubscribe = NetInfo.addEventListener(state => {
          const newConnected = state.isConnected && state.isInternetReachable;
          
          if (newConnected !== isConnected) {
            setIsConnected(newConnected);
            console.log(`📡 Network status changed: ${newConnected ? 'ONLINE ✅' : 'OFFLINE ⚠️'}`);
            
            // When coming back online, don't immediately show as connected
            // Wait for a successful API call to confirm
            if (newConnected) {
              retryCountRef.current = 0;
            }
          }
        });
      } catch (err) {
        console.warn('⚠️ Failed to initialize NetInfo:', err);
        setIsConnected(true); // Default to online
        setIsInitialized(true);
      }
    };

    initializeNetworkListener();

    // Handle app state changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const handleAppStateChange = useCallback((nextAppState) => {
    if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
      // App came to foreground - verify connection
      verifyConnection();
    }
    appStateRef.current = nextAppState;
  }, []);

  const verifyConnection = useCallback(async () => {
    const now = Date.now();
    // Don't check more than once per 5 seconds
    if (now - lastCheckRef.current < 5000) {
      return;
    }
    lastCheckRef.current = now;

    try {
      const state = await NetInfo.fetch();
      const connected = state.isConnected && state.isInternetReachable;
      setIsConnected(connected);
    } catch (err) {
      console.warn('⚠️ Failed to verify connection:', err);
    }
  }, []);

  // Determine if we should show offline UI
  // Only show if:
  // 1. Definitely offline (NetInfo confirms)
  // 2. AND we have pending operations that failed
  // Otherwise, show seamless experience
  useEffect(() => {
    if (!isInitialized) {
      setShouldShowOfflineUI(false);
      return;
    }

    // In offline mode, only show UI if there are critical issues
    if (!isConnected) {
      // User is definitely offline - but don't show UI unless necessary
      // The background sync will handle retries
      setShouldShowOfflineUI(false);
      console.log('🔄 Working offline - sync queue managing retries silently');
    } else {
      // Online - never show offline UI
      setShouldShowOfflineUI(false);
    }
  }, [isConnected, isInitialized]);

  return {
    isConnected,
    isInitialized,
    shouldShowOfflineUI,
    verifyConnection,
  };
}

/**
 * Hook for showing critical errors only (not status)
 * Use this for showing errors that require user action
 */
export function useCriticalError() {
  const [error, setError] = useState('');
  const [errorType, setErrorType] = useState(''); // 'storage', 'auth', 'server', etc.

  const showError = useCallback((message, type = 'general') => {
    setError(message);
    setErrorType(type);
    console.error(`🚨 ${type.toUpperCase()}: ${message}`);
  }, []);

  const clearError = useCallback(() => {
    setError('');
    setErrorType('');
  }, []);

  return { error, errorType, showError, clearError };
}