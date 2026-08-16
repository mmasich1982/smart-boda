// rider-app/src/screens/savings/AddSavingsContributionScreen.js
// ✅ CORRECTED: Using getLocalRiderId() pattern from working modules

import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
} from 'react-native';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import { useToast } from '../../components/Toast';

export default function AddSavingsContributionScreen({ route, navigation }) {
  const { state } = useRider();
  const { showToast } = useToast();
  const accountId = route?.params?.accountId;
  const account = route?.params?.account;

  const [amount, setAmount] = useState('');
  const [localRiderId, setLocalRiderId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // ✅ LOAD RIDER ID FROM LOCAL STORAGE
  useEffect(() => {
    async function loadRiderId() {
      try {
        const id = await getLocalRiderId();
        console.log('[AddSavingsContributionScreen] Loaded riderId from storage:', id);
        setLocalRiderId(id);
        
        if (!id) {
          setError('Rider information not found. Please return to Home.');
        }
      } catch (err) {
        console.error('[AddSavingsContributionScreen] Error loading riderId:', err);
        setError('Error loading rider information.');
      } finally {
        setLoading(false);
      }
    }
    
    loadRiderId();
  }, []);

  const handleSave = async () => {
    setError('');

    if (!amount || parseFloat(amount) <= 0) {
      setError('Enter an amount greater than zero.');
      showToast('Invalid amount', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        account_id: accountId,
        amount: parseFloat(amount),
      };

      console.log('[AddSavingsContributionScreen] Adding contribution:', payload);

      const response = await api.post('/savings/contribution', payload);

      console.log('[AddSavingsContributionScreen] Contribution added:', response.data);

      const label = account?.type === 'sacco' ? 'SACCO' : 'Chama';
      showToast(
        `KSh ${parseFloat(amount).toLocaleString()} added to ${account?.name} — keep it up!`,
        'success'
      );

      navigation.navigate('SavingsTypeList', { type: account?.type });
    } catch (err) {
      console.error('[AddSavingsContributionScreen] Add contribution error:', err);
      const errorMsg = err.response?.data?.detail || 'Failed to add savings';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <View style={styles.container}><Text>Loading...</Text></View>;
  }

  if (!account) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorMsg}>Account not found</Text>
      </View>
    );
  }

  const label = account.type === 'sacco' ? 'SACCO' : 'Chama';

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.backLink}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.screenTitle}>Add Savings</Text>
      <Text style={styles.screenSub}>
        Log a fresh contribution to your {label.toLowerCase()}, {account.name}.
      </Text>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      )}

      {/* Amount Field */}
      <View style={styles.field}>
        <Text style={styles.label}>
          Amount <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 200"
          placeholderTextColor="#b0a89d"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
        />
      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.saveBtn, (saving || !amount) && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving || !amount}
      >
        <Text style={styles.saveBtnText}>
          {saving ? 'Adding...' : 'Add Savings →'}
        </Text>
      </TouchableOpacity>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 18,
    backgroundColor: '#f6f4ef',
  },
  backLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ff7a1a',
    marginBottom: 16,
  },
  screenTitle: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 4,
  },
  screenSub: {
    fontSize: 12,
    color: '#5b606c',
    lineHeight: 18,
    marginBottom: 16,
  },

  errorMsg: {
    fontSize: 14,
    color: '#5b606c',
    marginTop: 20,
    textAlign: 'center',
  },

  errorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 11.5,
    color: '#a5312c',
    fontWeight: '600',
  },

  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 11.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.04,
    color: '#5b606c',
    marginBottom: 8,
  },
  required: {
    color: '#e5650a',
  },

  input: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 13,
    fontSize: 15,
    backgroundColor: '#fff',
    color: '#1a1c20',
  },

  saveBtn: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  saveBtnDisabled: {
    backgroundColor: '#e9dccc',
    shadowOpacity: 0,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});