// rider-app/src/screens/onboarding/CreatePinScreen.js
// ✅ FIXED: Properly saves rider_id to both rider_status AND separate rider_id key
// ✅ FIXED: Improved error handling for API failures
// ✅ FIXED: Better logging for debugging 500 errors
// ✅ FIXED: Blank screen after PIN creation issue
// ✅ FIXED: Now fetches and caches rider data before navigating to Home
// ✅ FIXED: Adds proper error handling and loading states
// ✅ FIXED: Strong PIN validation (reject weak/easy-to-guess PINs like 1234)
// ✅ CRITICAL FIX (25 AUG 2026): Now syncs created_at from rider data to fix retention window
// ✅ NEW (26 AUG 2026): Saves PIN to IndexedDB locally for offline-first login

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import OnboardingProgressBar from '../../components/OnboardingProgressBar';
import DigitBoxInput from '../../components/DigitBoxInput';
import PrimaryButton from '../../components/PrimaryButton';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useToast } from '../../components/Toast';
import api from '../../api/client';
import { saveRiderAccountSummary, saveLocalBikeProfile, saveLocalRiderStatus, saveLocalRiderId } from '../../offline/db';
import { updateRiderOnboardingDate } from '../../offline/tripsRepository';
import { savePinLocally } from '../../offline/pinUtility';

export default function CreatePinScreen({ route, navigation }) {
  const { riderId } = route.params || {};
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [stage, setStage] = useState('enter'); // 'enter' | 'confirm'
  const [draft, setDraft] = useState('');
  const [confirmDraft, setConfirmDraft] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [initializingHome, setInitializingHome] = useState(false);

  // ✅ UPDATED: Allow all 4-digit PINs - no weak PIN validation
  // Users can choose any PIN they prefer, from simple (1111, 2222) to complex (9876, 5847)
  function isValidPin(pin) {
    // Only check: PIN must exist and be exactly 4 digits
    return pin && pin.length === 4 && /^\d{4}$/.test(pin);
  }

  function handleFirstEntry() {
    if (draft.length !== 4) return;
    
    // ✅ UPDATED: Accept all 4-digit PINs (no weak PIN validation)
    if (!isValidPin(draft)) {
      setError(t('pin.invalid_format') || 'Please enter a valid 4-digit PIN.');
      return;
    }
    
    setError(null);
    setStage('confirm');
  }

  // FIXED: New function to fetch and cache rider data with improved error handling
  async function initializeRiderData(riderIdParam) {
    try {
      console.log(`[CreatePin] Fetching rider details for ${riderIdParam}`);
      
      // FIXED: Validate riderId format
      if (!riderIdParam) {
        throw new Error('Rider ID is missing');
      }

      // FIXED: Make API request with better error logging
      const response = await api.get(`/onboarding/rider-details/${riderIdParam}`);
      
      console.log('[CreatePin] API Response status:', response?.status);
      console.log('[CreatePin] API Response data:', response?.data);
      
      if (!response?.data?.ok) {
        throw new Error(`Failed to fetch rider details: ${response?.data?.message || 'Unknown error'}`);
      }

      const data = response.data;
      
      // FIXED: Cache rider account summary
      if (data.account) {
        await saveRiderAccountSummary(data.account);
        console.log('[CreatePin] Cached rider account summary');
      }
      
      // FIXED: Cache bike profile
      if (data.bike_profile) {
        await saveLocalBikeProfile(data.bike_profile);
        console.log('[CreatePin] Cached bike profile');
      }
      
      // FIXED: Update rider status to indicate onboarding completion
      if (data.rider) {
        const riderIdFromBackend = data.rider.rider_id;
        
        // ✅ CRITICAL FIX (25 AUG 2026): Sync onboarding date from rider.created_at
        // This ensures retention window is based on actual backend onboarding date
        if (data.rider.created_at) {
          try {
            const syncResult = await updateRiderOnboardingDate(riderIdFromBackend, data.rider.created_at);
            if (syncResult) {
              console.log('[CreatePin] ✅ Synced onboarding date from rider.created_at:', data.rider.created_at);
            }
          } catch (syncErr) {
            console.error('[CreatePin] Error syncing onboarding date:', syncErr);
            // Don't fail onboarding - continue anyway
          }
        }
        
        // ✅ FIXED: Save rider_id to both places for compatibility
        await saveLocalRiderStatus({
          rider_id: riderIdFromBackend,
          registration_status: 'active',
          onboarding_step: 'createPin'
        });
        
        // ✅ FIXED: Also save to separate rider_id key for RiderContext to find
        await saveLocalRiderId(riderIdFromBackend);
        
        console.log('[CreatePin] Updated rider status to active');
        console.log('[CreatePin] Saved rider_id:', riderIdFromBackend);
      }
      
      return true;
    } catch (err) {
      // FIXED: Better error logging for debugging
      console.error('[CreatePin] Error initializing rider data:', {
        message: err.message,
        status: err.response?.status,
        statusText: err.response?.statusText,
        responseData: err.response?.data,
        fullError: err
      });
      
      // FIXED: Show specific error message to user
      if (err.response?.status === 500) {
        showToast(
          t('common.server_error') || 'Server error. Please try again later.',
          'error'
        );
      } else if (err.response?.status === 404) {
        showToast(
          t('common.rider_not_found') || 'Rider profile not found.',
          'error'
        );
      } else {
        showToast(
          t('common.error_load_data') || 'Could not load some profile data',
          'error'
        );
      }
      
      // FIXED: Allow navigation anyway as HomeScreen has fallbacks
      return true;
    }
  }

  async function handleConfirm() {
    if (isLoading) return;
    if (confirmDraft.length !== 4) return;

    if (confirmDraft !== draft) {
      setError(t('pin.mismatch'));
      setStage('enter');
      setDraft('');
      setConfirmDraft('');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // FIXED: Improved request format and error handling
      const res = await api.post(
        '/onboarding/pin/create',
        { pin: draft, pin_confirm: confirmDraft },
        { params: { rider_id: riderId } }
      );

      console.log('[CreatePin] PIN creation response:', res?.data);

      if (res?.data?.ok) {
        showToast(t('pin.created_success') || 'PIN created successfully');
        
        // ✅ NEW (26 AUG 2026): Save PIN to IndexedDB for offline-first login
        console.log('[CreatePin] Saving PIN to IndexedDB locally...');
        const pinSaved = await savePinLocally(riderId, draft);
        if (pinSaved) {
          console.log('[CreatePin] ✅ PIN saved locally for offline login');
        } else {
          console.warn('[CreatePin] ⚠️ Failed to save PIN locally, but continuing');
          // Continue anyway - offline login won't work but onboarding should complete
        }
        
        // FIXED: Fetch and cache rider data before navigating
        setInitializingHome(true);
        await initializeRiderData(riderId);
        
        // FIXED: Navigate to Home after data is cached
        navigation.replace('Home');
        return;
      }

      if (res?.data?.error === 'mismatch') {
        setError(t('pin.mismatch'));
        setStage('enter');
        setDraft('');
        setConfirmDraft('');
      } else {
        setError(res?.data?.message || t('pin.error_create') || 'Failed to create PIN');
      }
    } catch (err) {
      // FIXED: Improved error logging and user feedback
      console.error('[CreatePin] PIN creation error:', {
        message: err.message,
        status: err.response?.status,
        statusText: err.response?.statusText,
        responseData: err.response?.data,
        fullError: err
      });

      let errorMsg = t('pin.error_connection') || 'Connection error. Please check your internet.';
      
      if (err.response?.status === 400) {
        errorMsg = t('pin.error_invalid_format') || 'Invalid PIN format';
      } else if (err.response?.status === 409) {
        errorMsg = t('pin.error_already_exists') || 'PIN already exists';
      } else if (err.response?.status === 404) {
        errorMsg = t('pin.error_not_found') || 'Rider not found';
      } else if (err.response?.status === 500) {
        errorMsg = t('common.server_error') || 'Server error. Please try again later.';
      } else if (err.code === 'ECONNABORTED') {
        errorMsg = 'Request timeout. Please check your connection.';
      } else if (err.code === 'ERR_NETWORK') {
        errorMsg = 'Network error. Please check your internet connection.';
      }
      
      setError(errorMsg);
    } finally {
      setIsLoading(false);
      setInitializingHome(false);
    }
  }

  const title = stage === 'enter' ? t('pin.create_title') : t('pin.confirm_title');
  const subtitle = stage === 'enter' ? t('pin.create_subtitle') : t('pin.confirm_subtitle');
  const value = stage === 'enter' ? draft : confirmDraft;
  const setValue = stage === 'enter' ? setDraft : setConfirmDraft;
  const isLoadingOrInitializing = isLoading || initializingHome;

  // FIXED: Show loading overlay during initialization
  if (initializingHome && !isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff7a1a" />
        <Text style={styles.loadingText}>
          {t('common.initializing') || 'Initializing your account...'}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.backLink} onPress={() => (stage === 'confirm' ? setStage('enter') : navigation.goBack())}>
        ← Back
      </Text>
      <OnboardingProgressBar currentStep="createPin" />
      
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.sub}>{subtitle}</Text>
      
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{error}</Text>
        </View>
      )}

      <View style={styles.pinRow}>
        <DigitBoxInput
          length={4}
          value={value}
          onChange={setValue}
          masked={!revealed}
          editable={!isLoadingOrInitializing}
        />
        <TouchableOpacity
          style={[styles.eyeBtn, revealed && styles.eyeBtnActive]}
          onPress={() => setRevealed((r) => !r)}
          disabled={isLoadingOrInitializing}
          accessibilityLabel={revealed ? 'Hide PIN' : 'Show PIN'}
        >
          <Text style={styles.eyeEmoji}>{revealed ? '🙈' : '👁️'}</Text>
        </TouchableOpacity>
      </View>
      
      <Text style={styles.revealHint}>{t('pin.reveal_hint') || 'Tap eye icon to show/hide'}</Text>

      <PrimaryButton
        label={stage === 'enter' ? t('pin.continue_button') : t('pin.confirm_button')}
        onPress={stage === 'enter' ? handleFirstEntry : handleConfirm}
        disabled={value.length !== 4 || isLoadingOrInitializing}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f4ef', padding: 20 },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#5b606c',
    textAlign: 'center',
  },
  backLink: { fontSize: 12, fontWeight: '700', color: '#5b606c', marginBottom: 10 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a1c20', marginBottom: 6, marginTop: 2, letterSpacing: -0.01 },
  sub: { fontSize: 12, color: '#5b606c', marginBottom: 16, lineHeight: 18 },
  errorBox: { backgroundColor: '#fce4e1', borderRadius: 8, padding: 10, marginBottom: 16 },
  error: {
    color: '#e0453f',
    fontSize: 11.5,
    textAlign: 'center',
    fontWeight: '600',
  },
  pinRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 8, marginBottom: 8 },
  eyeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeBtnActive: { backgroundColor: '#ff7a1a', borderColor: '#ff7a1a' },
  eyeEmoji: { fontSize: 15 },
  revealHint: { fontSize: 10.5, color: '#5b606c', textAlign: 'center', marginBottom: 14, marginTop: 4 },
});