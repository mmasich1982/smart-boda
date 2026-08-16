// rider-app/src/screens/savings/SavingsEntryScreen.js
// ✅ FIXED: Proper JSX structure, no unexpected text nodes

import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Picker,
} from 'react-native';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import { useToast } from '../../components/Toast';

export default function SavingsEntryScreen({ route, navigation }) {
  const { state } = useRider();
  const { showToast } = useToast();
  const type = route?.params?.type || 'sacco';

  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState('Weekly');
  const [localRiderId, setLocalRiderId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const label = type === 'sacco' ? 'SACCO' : 'Chama';
  const placeholder = type === 'sacco' ? 'Boda Riders SACCO' : 'Umoja Chama';

  useEffect(() => {
    async function loadRiderId() {
      try {
        const id = await getLocalRiderId();
        setLocalRiderId(id);
        if (!id) {
          setError('Rider information not found.');
        }
      } catch (err) {
        console.error('[SavingsEntryScreen] Error:', err);
        setError('Error loading rider information.');
      } finally {
        setLoading(false);
      }
    }
    loadRiderId();
  }, []);

  const handleSave = async () => {
    setError('');

    if (!name.trim()) {
      setError('Name is required.');
      showToast('Please enter a name', 'error');
      return;
    }

    const effectiveRiderId = localRiderId || state?.riderId;
    if (!effectiveRiderId) {
      setError('Rider information not available.');
      showToast('Rider information not available.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        type,
        name: name.trim(),
        frequency,
      };

      const response = await api.post('/savings/accounts', payload, {
        params: { rider_id: effectiveRiderId },
      });

      showToast(`${label} savings account added successfully.`, 'success');
      navigation.navigate('SavingsTypeList', { type });
    } catch (err) {
      console.error('[SavingsEntryScreen] Save error:', err);
      const errorMsg = err.response?.data?.detail || 'Failed to create account';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>{label} Savings</Text>
        <Text style={styles.screenSub}>A couple of details and we'll track your contributions.</Text>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={styles.label}>
          {label} Name <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#b0a89d"
          value={name}
          onChangeText={setName}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Frequency</Text>
        <View style={styles.pickerWrapper}>
          <Picker selectedValue={frequency} onValueChange={setFrequency} style={styles.picker}>
            <Picker.Item label="Daily" value="Daily" />
            <Picker.Item label="Weekly" value="Weekly" />
            <Picker.Item label="Monthly" value="Monthly" />
          </Picker>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, (saving || !name) && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving || !name}
      >
        <Text style={styles.saveBtnText}>{saving ? 'Adding...' : 'Add Saving →'}</Text>
      </TouchableOpacity>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f6f4ef',
  },
  loadingText: {
    fontSize: 14,
    color: '#5b606c',
  },
  container: {
    flex: 1,
    padding: 18,
    backgroundColor: '#f6f4ef',
  },
  header: {
    marginBottom: 16,
  },
  backLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ff7a1a',
    marginBottom: 8,
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
    marginBottom: 16,
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

  pickerWrapper: {
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  picker: {
    height: 50,
    color: '#1a1c20',
  },

  saveBtn: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
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