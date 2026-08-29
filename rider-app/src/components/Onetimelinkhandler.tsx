// rider-app/src/components/OneTimeLinkHandler.js
// ✅ ONE-TIME LINK HANDLER: Device fingerprinting, security, and secure redemption
// ✅ OFFLINE PERSISTENCE: IndexedDB adapter for local-first storage
// ✅ SEAMLESS RECOVERY: Consistent device identification across sessions

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import axios from 'axios';
import * as Device from 'expo-device';
import * as Application from 'expo-application';

// ============================================================================
// COMPONENT
// ============================================================================

export const OneTimeLinkHandler = () => {
  const route = useRoute();
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [claimResult, setClaimResult] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  // Extract token from route params
  const token = route.params?.token;

  // Main effect: Claim the link when component mounts or token changes
  useFocusEffect(
    React.useCallback(() => {
      if (token) {
        handleLinkClaim();
      } else {
        setError('No link token provided');
        setLoading(false);
      }
    }, [token])
  );

  /**
   * Main claim handler
   * 1. Gets device fingerprint
   * 2. Calls backend to validate and redeem link
   * 3. Handles response or errors
   */
  const handleLinkClaim = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!token) {
        setError('Invalid link token');
        setLoading(false);
        return;
      }

      // Step 1: Generate/retrieve device fingerprint
      const fingerprint = await getDeviceFingerprint();
      console.log('[OneTimeLink] Device fingerprint:', fingerprint);

      // Step 2: Gather request data
      const requestData = {
        token,
        device_fingerprint: fingerprint,
        user_agent: await getUserAgent(),
        ip_address: null, // Mobile doesn't expose IP easily
      };

      console.log('[OneTimeLink] Claiming link with:', {
        token: token.substring(0, 10) + '...',
        device_fingerprint: fingerprint,
      });

      // Step 3: Call backend API
      const response = await axios.post(
        `${process.env.REACT_APP_API_BASE_URL || 'https://api.smartboda.app'}/api/v1/one-time-links/claim`,
        requestData,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10 second timeout
        }
      );

      console.log('[OneTimeLink] Claim response:', {
        is_valid: response.data.is_valid,
        status: response.data.status,
        error_code: response.data.error_code,
      });

      // Step 4: Handle response
      if (response.data.is_valid) {
        setClaimResult(response.data);

        // Store claimed data locally using IndexedDB
        const claimedData = {
          link_id: response.data.link_id,
          rider_id: response.data.rider_id,
          metadata: response.data.metadata,
          claimed_at: new Date().toISOString(),
        };

        await indexedDbAdapter.kvSet(
          'one_time_link_claimed',
          JSON.stringify(claimedData)
        );

        console.log('[OneTimeLink] ✓ Link claimed successfully for rider:', response.data.rider_id);

        // Navigate to next screen (e.g., verification or onboarding)
        setTimeout(() => {
          navigation.navigate('RiderVerification', {
            riderId: response.data.rider_id,
            riderData: response.data.metadata,
            linkId: response.data.link_id,
          });
        }, 1500); // Show success message briefly
      } else {
        // Link is invalid
        console.log('[OneTimeLink] ✗ Link claim failed:', response.data.error_code);
        setError(getErrorMessage(response.data.error_code, response.data.error));
        setClaimResult(response.data);
      }
    } catch (err) {
      console.error('[OneTimeLink] Error claiming link:', err);

      const errorMessage =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        (err.code === 'ECONNABORTED'
          ? 'Request timed out. Please check your internet connection.'
          : 'Failed to process link. Please try again.');

      setError(errorMessage);
      setRetryCount(retryCount + 1);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Generate or retrieve device fingerprint
   * Persisted in IndexedDB for consistency across sessions
   */
  const getDeviceFingerprint = async () => {
    try {
      const storedFingerprint = await indexedDbAdapter.kvGet('device_fingerprint');

      if (storedFingerprint) {
        return storedFingerprint;
      }

      // Create new fingerprint on first run
      const deviceId = await getUniqueDeviceId();
      const fingerprint = `${deviceId}-${Date.now()}`;

      await indexedDbAdapter.kvSet('device_fingerprint', fingerprint);
      console.log('[OneTimeLink] Created new device fingerprint');

      return fingerprint;
    } catch (err) {
      console.error('[OneTimeLink] Error getting device fingerprint:', err);
      // Fallback fingerprint
      return `fallback-${Date.now()}`;
    }
  };

  /**
   * Get unique device identifier
   * Uses Expo Device API for consistent identification
   */
  const getUniqueDeviceId = async () => {
    try {
      // Try to get Expo Application ID
      const appId = Application.androidId || Application.getIosIdForVendor?.() || '';

      if (appId) {
        return appId;
      }

      // Fallback: Generate UUID
      return generateUUID();
    } catch (err) {
      console.error('[OneTimeLink] Error getting device ID:', err);
      return generateUUID();
    }
  };

  /**
   * Get user agent string
   */
  const getUserAgent = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
        return navigator.userAgent;
      }

      // For native platforms, construct UA from device info
      const deviceName = Device.deviceName || 'Unknown Device';
      const brand = Device.brand || 'Unknown';
      const modelName = Device.modelName || 'Unknown';
      const osName = Platform.OS === 'ios' ? 'iOS' : 'Android';
      const osVersion = Platform.Version;

      return `SmartBodaApp/${
        Application.applicationVersion || '1.0.0'
      } (${brand} ${modelName}; ${osName} ${osVersion})`;
    } catch (err) {
      console.error('[OneTimeLink] Error getting user agent:', err);
      return 'SmartBodaApp';
    }
  };

  /**
   * Generate UUID v4
   */
  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  /**
   * Get user-friendly error message
   */
  const getErrorMessage = (errorCode, errorMessage) => {
    const errorMessages = {
      LINK_NOT_FOUND:
        'Link not found. Make sure you have the correct link.',
      LINK_ALREADY_USED:
        'This link has already been used. Please ask for a new link.',
      LINK_EXPIRED: 'This link has expired. Please ask for a new link.',
      LINK_REVOKED:
        'This link has been revoked and can no longer be used.',
      LINK_MAX_ATTEMPTS:
        'Too many failed attempts. This link has been deactivated.',
      DEVICE_MISMATCH:
        'This link can only be used on the original device. Please try again on the device where you received the link.',
      LINK_INVALID: 'Invalid link. Please try again.',
    };

    return (
      errorMessages[errorCode || ''] ||
      errorMessage ||
      'Failed to process link. Please try again.'
    );
  };

  // ============================================================================
  // RENDER STATES
  // ============================================================================

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#00A86B" />
        <Text className="mt-4 text-center text-gray-600">
          Processing your link...
        </Text>
        <Text className="mt-2 text-center text-xs text-gray-400">
          Please wait
        </Text>
      </View>
    );
  }

  if (error && !claimResult?.is_valid) {
    return (
      <View className="flex-1 bg-white">
        <ScrollView
          className="flex-1 px-6 py-8"
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        >
          {/* Error Icon */}
          <View className="mb-4 items-center">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <Text className="text-2xl">⚠️</Text>
            </View>
          </View>

          {/* Error Title */}
          <Text className="mb-2 text-center text-lg font-bold text-red-600">
            Link Error
          </Text>

          {/* Error Message */}
          <Text className="mb-6 text-center text-gray-600">{error}</Text>

          {/* Additional Info for specific errors */}
          {claimResult?.error_code === 'DEVICE_MISMATCH' && (
            <View className="mb-6 rounded-lg bg-blue-50 p-4">
              <Text className="text-center text-sm text-blue-700">
                💡 This link is tied to the device it was originally created on.
                Please use the same device or ask for a new link.
              </Text>
            </View>
          )}

          {claimResult?.error_code === 'LINK_ALREADY_USED' && (
            <View className="mb-6 rounded-lg bg-blue-50 p-4">
              <Text className="text-center text-sm text-blue-700">
                💡 Someone has already claimed this link. Ask your referrer for
                a new one.
              </Text>
            </View>
          )}

          {claimResult?.error_code === 'LINK_EXPIRED' && (
            <View className="mb-6 rounded-lg bg-blue-50 p-4">
              <Text className="text-center text-sm text-blue-700">
                💡 Links expire after 24 hours. Ask your referrer to send you a
                new link.
              </Text>
            </View>
          )}

          {/* Action Buttons */}
          <View className="gap-3">
            {retryCount < 2 && (
              <TouchableOpacity
                onPress={handleLinkClaim}
                className="items-center rounded-lg bg-blue-600 py-3"
              >
                <Text className="font-semibold text-white">Try Again</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => navigation.navigate('Home')}
              className="items-center rounded-lg border border-gray-300 py-3"
            >
              <Text className="font-semibold text-gray-700">Go Home</Text>
            </TouchableOpacity>
          </View>

          {/* Support Info */}
          <Text className="mt-8 text-center text-xs text-gray-400">
            Need help? Contact support at support@smartboda.com
          </Text>
        </ScrollView>
      </View>
    );
  }

  if (claimResult?.is_valid) {
    return (
      <View className="flex-1 bg-white">
        <View className="flex-1 items-center justify-center px-6">
          {/* Success Icon */}
          <View className="mb-4">
            <View className="h-20 w-20 items-center justify-center rounded-full bg-green-100">
              <Text className="text-4xl">✓</Text>
            </View>
          </View>

          {/* Success Message */}
          <Text className="mb-2 text-center text-lg font-bold text-green-600">
            Link Verified!
          </Text>
          <Text className="text-center text-gray-600">
            Welcome to Smart Boda
          </Text>

          {/* Metadata Display */}
          {claimResult.metadata && (
            <View className="mt-6 w-full rounded-lg bg-gray-50 p-4">
              <Text className="mb-2 font-semibold text-gray-700">
                Link Details
              </Text>
              <Text className="text-sm text-gray-600">
                Referral Code:{' '}
                {claimResult.metadata.referral_code || 'N/A'}
              </Text>
            </View>
          )}

          {/* Loading indicator for redirect */}
          <ActivityIndicator
            size="small"
            color="#00A86B"
            style={{ marginTop: 20 }}
          />
          <Text className="mt-4 text-center text-xs text-gray-400">
            Setting up your account...
          </Text>
        </View>
      </View>
    );
  }

  return null;
};

export default OneTimeLinkHandler;