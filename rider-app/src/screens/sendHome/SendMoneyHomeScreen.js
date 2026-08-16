import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, Picker, Alert, ActivityIndicator } from 'react-native';
import { useToast } from '../../components/Toast';
import { useMasterData } from '../../hooks/useMasterData';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import { getSavedRecipients, saveRemittance, saveRecipient } from '../../offline/remittanceRepository';
import api from '../../api/client';

/**
 * SendMoneyHomeScreen.js
 * ========================
 * ✅ FIXED: Proper rider_id management using local storage
 * ✅ FIXED: Attractive dropdown styling aligned to cleaned.html
 * ✅ FIXED: Complete form validation and error handling
 * ✅ FIXED: Offline support with backend sync
 */

export default function SendMoneyHomeScreen({ navigation }) {
  const { showToast } = useToast();
  const { familyRelationships, paymentChannels } = useMasterData();
  const { state } = useRider();

  // Rider ID management with local storage
  const [localRiderId, setLocalRiderId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [recipient, setRecipient] = useState('');
  const [showNewRecipient, setShowNewRecipient] = useState(false);
  const [relationship, setRelationship] = useState('');
  const [amount, setAmount] = useState('');
  const [channel, setChannel] = useState('');
  const [savedRecipients, setSavedRecipients] = useState([]);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // ✅ LOAD RIDER ID FROM LOCAL STORAGE
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        setLocalRiderId(id);
        
        // Load saved recipients
        const recipients = await getSavedRecipients();
        setSavedRecipients(recipients || []);
      } catch (err) {
        console.error('Error loading data:', err);
        showToast('Error loading rider information', 'error');
      } finally {
        setLoading(false);
      }
    };
    
    loadRiderId();
  }, [showToast]);

  // ✅ USE LOCAL STORAGE AS PRIMARY, FALLBACK TO CONTEXT
  const effectiveRiderId = localRiderId || state?.riderId;

  const handleRecipientChange = (value) => {
    if (value === '__new__') {
      setShowNewRecipient(true);
      setRecipient('');
    } else {
      setShowNewRecipient(false);
      setRecipient(value);
    }
  };

  const handleSaveRemittance = useCallback(async () => {
    setError(null);

    // Validation
    if (!recipient || recipient.trim() === '') {
      const msg = 'Select or enter a Recipient.';
      setError(msg);
      showToast(msg, 'warn');
      return;
    }

    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      const msg = 'Enter an amount greater than zero.';
      setError(msg);
      showToast(msg, 'error');
      return;
    }

    if (!channel) {
      const msg = 'Select the Channel Used.';
      setError(msg);
      showToast(msg, 'warn');
      return;
    }

    if (!effectiveRiderId) {
      const msg = 'Rider information not found. Please return to home.';
      setError(msg);
      showToast(msg, 'error');
      return;
    }

    try {
      setSubmitting(true);

      // Create remittance object
      const remittance = {
        id: 'RMT-' + Math.floor(100000 + Math.random() * 900000),
        ts: new Date().toISOString(),
        recipient: recipient.trim(),
        relationship: relationship || null,
        amount: amt,
        channel,
        syncStatus: 'pending',
      };

      // ✅ SAVE TO OFFLINE DATABASE
      await saveRemittance(remittance);

      // ✅ SAVE RECIPIENT IF NEW
      if (!savedRecipients.includes(recipient.trim())) {
        await saveRecipient(recipient.trim());
        setSavedRecipients([...savedRecipients, recipient.trim()]);
      }

      // ✅ TRY TO SYNC TO BACKEND
      try {
        await api.post('/financial/remittance', {
          recipient_name: recipient.trim(),
          relationship_code: relationship || null,
          amount: amt,
          channel_code: channel,
        }, {
          params: { rider_id: effectiveRiderId }
        });
        remittance.syncStatus = 'synced';
      } catch (syncErr) {
        console.warn('Could not sync to backend, saved offline:', syncErr);
        // Keep as pending - will sync later
      }

      showToast(
        `Sent home to ${recipient.trim()}: KSh ${amt.toLocaleString()} logged.`,
        'success'
      );

      // Clear form
      setRecipient('');
      setRelationship('');
      setAmount('');
      setChannel('');
      setShowNewRecipient(false);

      // Navigate to history
      navigation.replace('SendMoneyHistory');
    } catch (err) {
      console.error('Error saving remittance:', err);
      const errorMsg = err.response?.data?.detail || err.message || 'Error saving remittance';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  }, [recipient, amount, channel, relationship, savedRecipients, effectiveRiderId, showToast, navigation]);

  const handleViewHistory = useCallback(() => {
    navigation.navigate('SendMoneyHistory');
  }, [navigation]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff7a1a" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>← Home</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Send Money Home</Text>
      </View>

      <View style={styles.body}>
        {/* Recipient Field */}
        <View style={styles.field}>
          <Text style={styles.label}>
            Recipient <Text style={styles.required}>*</Text>
          </Text>
          {savedRecipients.length > 0 && !showNewRecipient ? (
            <View style={styles.selectWrapper}>
              <Picker
                selectedValue={recipient}
                onValueChange={handleRecipientChange}
                style={styles.picker}
                enabled={!submitting}
              >
                <Picker.Item label="Select..." value="" />
                {savedRecipients.map((r) => (
                  <Picker.Item key={r} label={r} value={r} />
                ))}
                <Picker.Item label="＋ New recipient" value="__new__" />
              </Picker>
            </View>
          ) : null}
          
          {showNewRecipient || savedRecipients.length === 0 ? (
            <TextInput
              style={[
                styles.input,
                { marginTop: savedRecipients.length > 0 && !showNewRecipient ? 8 : 0 }
              ]}
              placeholder="e.g. Mother"
              maxLength={60}
              value={recipient}
              onChangeText={setRecipient}
              editable={!submitting}
              placeholderTextColor="#999"
            />
          ) : null}
        </View>

        {/* Relationship Field */}
        <View style={styles.field}>
          <Text style={styles.label}>
            Relationship <Text style={styles.optional}>(optional)</Text>
          </Text>
          <View style={styles.selectWrapper}>
            <Picker
              selectedValue={relationship}
              onValueChange={setRelationship}
              style={styles.picker}
              enabled={!submitting}
            >
              <Picker.Item label="Select..." value="" />
              {familyRelationships.map((r) => (
                <Picker.Item key={r} label={r} value={r} />
              ))}
            </Picker>
          </View>
        </View>

        {/* Amount Field */}
        <View style={styles.field}>
          <Text style={styles.label}>
            Amount <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            keyboardType="decimal-pad"
            inputMode="decimal"
            value={amount}
            onChangeText={setAmount}
            editable={!submitting}
            placeholderTextColor="#999"
          />
        </View>

        {/* Channel Field */}
        <View style={styles.field}>
          <Text style={styles.label}>
            Channel Used <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.selectWrapper}>
            <Picker
              selectedValue={channel}
              onValueChange={setChannel}
              style={styles.picker}
              enabled={!submitting}
            >
              <Picker.Item label="Select..." value="" />
              {paymentChannels.map((c) => (
                <Picker.Item key={c.key} label={c.label} value={c.key} />
              ))}
            </Picker>
          </View>
        </View>

        {/* Error Message */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.error}>⚠️ {error}</Text>
          </View>
        )}

        {/* Action Buttons */}
        <TouchableOpacity
          style={[
            styles.button,
            styles.buttonPrimary,
            (submitting || !effectiveRiderId) && styles.buttonDisabled
          ]}
          onPress={handleSaveRemittance}
          disabled={submitting || !effectiveRiderId}
        >
          <Text style={styles.buttonText}>
            {submitting ? 'Saving...' : 'Save →'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonGhost]}
          onPress={handleViewHistory}
          disabled={submitting}
        >
          <Text style={styles.buttonGhostText}>View History →</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f6f4ef',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  backLink: {
    fontSize: 13,
    color: '#ff7a1a',
    fontWeight: '600',
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1c20',
  },
  body: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 8,
  },
  required: {
    color: '#e0453f',
    fontSize: 14,
  },
  optional: {
    fontWeight: '500',
    color: '#5b606c',
    fontSize: 12,
  },
  selectWrapper: {
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
    minHeight: 48,
    justifyContent: 'center',
  },
  picker: {
    backgroundColor: '#fff',
    color: '#1a1c20',
    height: 48,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1a1c20',
    fontFamily: 'System',
  },
  errorContainer: {
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fee8e6',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#e0453f',
  },
  error: {
    color: '#e0453f',
    fontSize: 13,
    fontWeight: '600',
  },
  button: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 10,
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#ff7a1a',
  },
  buttonGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
  },
  buttonText: {
    color: '#fff',
    fontSize: 15.5,
    fontWeight: '700',
  },
  buttonGhostText: {
    color: '#ff7a1a',
    fontSize: 15.5,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});