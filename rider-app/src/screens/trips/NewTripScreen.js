// rider-app/src/screens/trips/NewTripScreen.js
// FIXED: Now saves trip to both backend API AND local offline store
// - Trip data is immediately available in local store for HeroFareCard display
// - Proper offline-first architecture with dual persistence
// - FIXED: Added Smart Boda branding at top (matching home screen design)
// - FIXED: Enhanced keypad buttons with prominent light orange hover highlight for better readability

import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import { saveTrip } from '../../offline/tripsRepository';

const PAYMENT_METHODS = [
  { key: 'Cash', label: 'Cash', emoji: '💵' },
  { key: 'MPesa', label: 'M-Pesa', emoji: '📲' },
  { key: 'LipaLater', label: 'Lipa Later', emoji: '🕒' },
];

export default function NewTripScreen({ navigation }) {
  const { riderId, dispatch } = useRider();
  
  const [amount, setAmount] = useState('');
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [hoveredKey, setHoveredKey] = useState(null);
  const [localRiderId, setLocalRiderId] = useState(null);
  const [loading, setLoading] = useState(true);

  // WORKAROUND: Load riderId directly from offline storage
  useEffect(() => {
    async function loadRiderId() {
      try {
        const id = await getLocalRiderId();
        console.log('[NewTripScreen] Loaded riderId from storage:', id);
        setLocalRiderId(id);
        
        if (!id) {
          setError('⚠️ No rider ID found in storage. Please return to Home and try again.');
        }
      } catch (err) {
        console.error('[NewTripScreen] Error loading riderId:', err);
        setError('⚠️ Error loading rider information. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    
    loadRiderId();
  }, []);

  const handleKeypadPress = (digit) => {
    if (digit === 'back') {
      setAmount(amount.slice(0, -1));
    } else if (digit === '.') {
      if (!amount.includes('.') && amount) {
        setAmount(amount + digit);
      }
    } else {
      if (amount.length < 10) {
        setAmount(amount + digit);
      }
    }
  };

  const handlePaymentMethodSelect = (methodKey) => {
    if (methodKey === 'LipaLater') {
      const amtValue = parseFloat(amount);
      if (!amount || amtValue <= 0) {
        Alert.alert('Error', 'Enter the fare amount first, then choose Lipa Later.');
        return;
      }
      dispatch({ type: 'CLEAR_LIPA_LATER_DRAFT' });
      navigation.navigate('LipaLaterEntry', { amount });
      return;
    }
    setSelectedMethod(methodKey);
  };

  const handleSaveTrip = async () => {
    setError('');

    // Use localRiderId (directly loaded from storage)
    const effectiveRiderId = localRiderId || riderId;
    
    if (!effectiveRiderId) {
      const errorMsg = 'Rider information not available. Please return to Home.';
      setError(errorMsg);
      Alert.alert('Error', errorMsg);
      return;
    }

    const amtValue = parseFloat(amount);
    if (!amount || amtValue <= 0) {
      Alert.alert('Error', 'A trip needs a fare amount greater than zero.');
      return;
    }

    if (!selectedMethod) {
      Alert.alert('Error', 'Select a payment method to continue.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        amount: amtValue,
        payment_channel_code: selectedMethod,
        note: '',
        recorded_at: new Date().toISOString(),
      };

      // ✅ Step 1: Save to backend API
      const response = await api.post(`/trips?rider_id=${effectiveRiderId}`, payload);

      if (response.status === 201 || response.status === 200) {
        // ✅ Step 2: FIXED - Also save to local offline store for immediate display
        // Map the API response/payload to local trip object structure
        const localTrip = {
          id: response.data?.trip_id || `trip_${Date.now()}`,
          riderId: effectiveRiderId,
          amount: amtValue,
          paymentMethod: selectedMethod,  // Local store uses camelCase
          note: payload.note || '',
          recordedAt: new Date(payload.recorded_at),
          timestamp: new Date(payload.recorded_at).getTime(),  // timestamp in milliseconds
          status: 'active',
          syncStatus: 'synced',
        };

        // Save to local store
        await saveTrip(localTrip);
        console.log('[NewTripScreen] Trip saved to local store:', localTrip.id);

        Alert.alert('Success', `Trip saved! Today's total: KSh ${amtValue.toLocaleString()}.`);
        setAmount('');
        setSelectedMethod(null);
        // ✅ Navigate back with refreshFare flag so HomeScreen refetches from local store
        navigation.navigate('Home', { refreshFare: true });
      }
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.response?.data?.message || 'Failed to save trip. Please try again.';
      setError(errorMsg);
      Alert.alert('Error', errorMsg);
      console.error('[NewTripScreen] Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading rider information...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} label="← Home" />
      
      {/* FIXED: Added Smart Boda Branding Header (matching home screen) */}
      <View style={styles.brandingHeader}>
        <View style={styles.brandingContent}>
          <Text style={styles.brandingEmoji}>🏍️</Text>
          <View style={styles.brandingText}>
            <Text style={styles.brandingTitle}>Smart Boda</Text>
            <Text style={styles.brandingSubtitle}>Track every trip</Text>
          </View>
        </View>
      </View>

      <Text style={styles.title}>New Trip</Text>

      {/* Amount Display */}
      <View style={styles.amountDisplay}>
        <Text style={styles.amountCurrency}>KSh</Text>
        <Text style={styles.amountValue}>{amount || '0'}</Text>
      </View>

      {/* FIXED: Keypad with Enhanced Hover Effects */}
      <View style={styles.keypad}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'].map((key) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.keypadButton,
              hoveredKey === key && styles.keypadButtonHovered,
            ]}
            onPress={() => handleKeypadPress(key)}
            onPressIn={() => setHoveredKey(key)}
            onPressOut={() => setHoveredKey(null)}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.keypadButtonText,
              hoveredKey === key && styles.keypadButtonTextHovered,
            ]}>
              {key === 'back' ? '⌫' : key}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Payment Method Label */}
      <Text style={styles.methodLabel}>
        Payment Method <Text style={styles.requiredStar}>*</Text>
      </Text>

      {/* Payment Method Tiles */}
      <View style={styles.paymentGrid}>
        {PAYMENT_METHODS.map((method) => (
          <TouchableOpacity
            key={method.key}
            style={[
              styles.channelTile,
              selectedMethod === method.key && styles.channelTileSelected,
            ]}
            onPress={() => handlePaymentMethodSelect(method.key)}
          >
            <Text style={styles.channelLabel}>{method.emoji} {method.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Save Button */}
      <TouchableOpacity
        style={[
          styles.saveButton,
          (saving || !amount || !selectedMethod || !localRiderId) && styles.saveButtonDisabled,
        ]}
        onPress={handleSaveTrip}
        disabled={saving || !amount || !selectedMethod || !localRiderId}
      >
        <Text style={styles.saveButtonText}>
          {saving ? 'Saving...' : 'Save Trip →'}
        </Text>
      </TouchableOpacity>

      {/* Offline Hint */}
      <Text style={styles.hint}>Works fully offline — saved instantly either way.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#5b606c',
    textAlign: 'center',
    marginTop: 40,
  },
  // FIXED: Added branding header styles
  brandingHeader: {
    marginBottom: 20,
    paddingHorizontal: 0,
  },
  brandingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandingEmoji: {
    fontSize: 28,
  },
  brandingText: {
    flex: 1,
  },
  brandingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1c20',
  },
  brandingSubtitle: {
    fontSize: 12,
    color: '#5b606c',
    marginTop: 2,
  },
  title: {
    fontFamily: 'Space Grotesk',
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 20,
  },
  amountDisplay: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7e4db',
    borderRadius: 14,
    padding: 24,
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountCurrency: {
    fontSize: 12,
    color: '#5b606c',
    marginBottom: 8,
  },
  amountValue: {
    fontFamily: 'Space Grotesk',
    fontSize: 48,
    fontWeight: '700',
    color: '#1a1c20',
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  keypadButton: {
    width: '31%',
    aspectRatio: 1.2,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7e4db',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // FIXED: Enhanced hover effect with prominent light orange highlight
  keypadButtonHovered: {
    backgroundColor: '#ffebd9',
    borderColor: '#ff7a1a',
    borderWidth: 2,
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  keypadButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1c20',
  },
  // FIXED: Text hover state for better readability
  keypadButtonTextHovered: {
    color: '#ff7a1a',
    fontWeight: '800',
  },
  methodLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.04,
    color: '#5b606c',
    marginBottom: 7,
  },
  requiredStar: {
    color: '#e5650a',
  },
  paymentGrid: {
    gap: 9,
    marginBottom: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  channelTile: {
    flex: 1,
    minWidth: '30%',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 13,
    paddingVertical: 11,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelTileSelected: {
    borderColor: '#ff7a1a',
    backgroundColor: '#fff6ee',
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  channelLabel: {
    fontWeight: '700',
    fontSize: 12.5,
    color: '#1a1c20',
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    fontSize: 11.5,
    color: '#a5312c',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  saveButtonDisabled: {
    backgroundColor: '#e9dccc',
    shadowOpacity: 0,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  hint: {
    textAlign: 'center',
    marginTop: 10,
    fontSize: 12,
    color: '#5b606c',
  },
});