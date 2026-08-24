// rider-app/src/screens/settings/SettingsScreen.js
/**
 * COMPLETE SETTINGS & BIKE PROFILE SCREEN (RA-22)
 * Production-ready with proper Rider ID handling and Logout
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ScrollView, View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert
} from 'react-native';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId, clearLocalRiderId, clearLocalAuthToken } from '../../offline/db';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import GhostButton from '../../components/GhostButton';
import FormField from '../../components/FormField';
import { useToast } from '../../components/Toast';
import colors from '../../theme/colors';
import api from '../../api/client';

const LANGUAGES = [
  { code: 'en', native: 'English', label: 'English' },
  { code: 'sw', native: 'Kiswahili', label: 'Kiswahili' },
];

const FUEL_TYPES = [
  { value: 'petrol', label: '⛽ Petrol' },
  { value: 'electric', label: '🔋 Electric' },
];

export default function SettingsScreen({ navigation }) {
  const { state: riderState } = useRider();
  const { showToast } = useToast();

  const [localRiderId, setLocalRiderId] = useState(null);
  const [riderData, setRiderData] = useState(null);
  const [bikeData, setBikeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingLanguage, setEditingLanguage] = useState(false);
  const [editingFuel, setEditingFuel] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [selectedFuel, setSelectedFuel] = useState('petrol');

  // ✅ CRITICAL: Load Rider ID from local storage
  useEffect(() => {
    async function loadRiderId() {
      try {
        const id = await getLocalRiderId();
        setLocalRiderId(id);
      } catch (err) {
        console.error('Error loading riderId:', err);
      }
    }
    loadRiderId();
  }, []);

  // ✅ Get effective rider ID
  const effectiveRiderId = localRiderId || riderState?.riderId;

  // Fetch rider and bike data
  useFocusEffect(
    useCallback(() => {
      if (effectiveRiderId) {
        loadSettingsData();
      }
    }, [effectiveRiderId])
  );

  const loadSettingsData = async () => {
    try {
      setLoading(true);

      // Fetch rider profile
      const riderRes = await api.get('/settings/profile', {
        params: { rider_id: effectiveRiderId }
      });
      setRiderData(riderRes.data);
      setSelectedLanguage(riderRes.data?.language || 'en');

      // Fetch bike profile
      const bikeRes = await api.get('/settings/bike-profile', {
        params: { rider_id: effectiveRiderId }
      });
      setBikeData(bikeRes.data);
      setSelectedFuel(bikeRes.data?.fuel_type || 'petrol');
    } catch (err) {
      console.error('Error loading settings:', err);
      showToast('Error loading settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeLanguage = async (langCode) => {
    try {
      setSaving(true);
      await api.patch('/settings/language', null, {
        params: {
          rider_id: effectiveRiderId,
          language_code: langCode
        }
      });
      setSelectedLanguage(langCode);
      setEditingLanguage(false);
      showToast('Language updated', 'success');
    } catch (err) {
      console.error('Error changing language:', err);
      showToast('Failed to update language', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangeFuel = async (fuelType) => {
    if (selectedFuel === fuelType) {
      setEditingFuel(false);
      return;
    }

    try {
      setSaving(true);
      await api.patch('/settings/bike/fuel-type', null, {
        params: {
          rider_id: effectiveRiderId,
          fuel_type: fuelType
        }
      });
      setSelectedFuel(fuelType);
      setEditingFuel(false);
      showToast('Fuel type updated', 'success');
    } catch (err) {
      console.error('Error changing fuel type:', err);
      showToast('Failed to update fuel type', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out? You\'ll need to log in again with your PIN.',
      [
        { text: 'Cancel', onPress: () => {} },
        {
          text: 'Log Out',
          onPress: async () => {
            try {
              // Clear local storage
              await clearLocalRiderId();
              await clearLocalAuthToken();

              showToast('Logged out successfully', 'success');

              // Navigate to PinLogin
              navigation.reset({
                index: 0,
                routes: [{ name: 'PinLogin' }]
              });
            } catch (err) {
              console.error('Logout error:', err);
              showToast('Error logging out', 'error');
            }
          },
          style: 'destructive'
        }
      ]
    );
  };

  const currentLang = LANGUAGES.find(l => l.code === selectedLanguage);

  if (!effectiveRiderId) {
    return (
      <View style={styles.container}>
        <BackLink label="← Home" onPress={() => navigation.navigate('Home')} />
        <Text style={styles.errorText}>Unable to load settings</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContainer]}>
        <ActivityIndicator size="large" color={colors.bodaOrange} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink label="← Home" onPress={() => navigation.navigate('Home')} />

      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>Your account and motorcycle</Text>

      {/* MY PROFILE SECTION */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>👤 My Profile</Text>

        <View style={styles.row}>
          <Text style={styles.key}>Name</Text>
          <Text style={styles.value}>{riderData?.full_name || '—'}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.key}>Mobile Number</Text>
          <Text style={styles.value}>{riderData?.mobile_number || '—'}</Text>
        </View>

        <TouchableOpacity
          style={styles.ghostBtn}
          onPress={() => navigation.navigate('EditMobileNumber')}
        >
          <Text style={styles.ghostBtnText}>Change Mobile Number</Text>
        </TouchableOpacity>
      </View>

      {/* LOGIN & SECURITY SECTION */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🔑 Login & Security</Text>

        <View style={styles.row}>
          <Text style={styles.key}>Login PIN</Text>
          <Text style={styles.value}>••••</Text>
        </View>

        <TouchableOpacity
          style={styles.ghostBtn}
          onPress={() => navigation.navigate('ChangePinVerify')}
        >
          <Text style={styles.ghostBtnText}>Change PIN</Text>
        </TouchableOpacity>
      </View>

      {/* LANGUAGE SECTION */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🌐 My Language</Text>

        <View style={styles.row}>
          <Text style={styles.key}>Current Language</Text>
          <Text style={styles.value}>{currentLang?.native || '—'}</Text>
        </View>

        {editingLanguage ? (
          <>
            <View style={styles.selectContainer}>
              {LANGUAGES.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[
                    styles.selectOption,
                    selectedLanguage === lang.code && styles.selectOptionActive
                  ]}
                  onPress={() => handleChangeLanguage(lang.code)}
                  disabled={saving}
                >
                  <Text style={[
                    styles.selectOptionText,
                    selectedLanguage === lang.code && styles.selectOptionTextActive
                  ]}>
                    {lang.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              onPress={() => setEditingLanguage(false)}
              disabled={saving}
            >
              <Text style={styles.cancelLink}>Cancel</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={styles.ghostBtn}
            onPress={() => setEditingLanguage(true)}
          >
            <Text style={styles.ghostBtnText}>Change Language</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* BIKE PROFILE SECTION */}
      {bikeData ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🏍️ My Motorcycle</Text>

          <View style={styles.row}>
            <Text style={styles.key}>Plate Number</Text>
            <Text style={styles.value}>{bikeData?.plate_number || '—'}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.key}>Fuel Type</Text>
            <Text style={styles.value}>
              {bikeData?.fuel_type === 'electric' ? '🔋' : '⛽'} {bikeData?.fuel_type}
            </Text>
          </View>

          {editingFuel ? (
            <>
              <View style={styles.selectContainer}>
                {FUEL_TYPES.map((fuel) => (
                  <TouchableOpacity
                    key={fuel.value}
                    style={[
                      styles.selectOption,
                      selectedFuel === fuel.value && styles.selectOptionActive
                    ]}
                    onPress={() => handleChangeFuel(fuel.value)}
                    disabled={saving}
                  >
                    <Text style={[
                      styles.selectOptionText,
                      selectedFuel === fuel.value && styles.selectOptionTextActive
                    ]}>
                      {fuel.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                onPress={() => setEditingFuel(false)}
                disabled={saving}
              >
                <Text style={styles.cancelLink}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.ghostBtn}
              onPress={() => setEditingFuel(true)}
            >
              <Text style={styles.ghostBtnText}>Change Fuel Type</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={[styles.card, styles.infoBanner]}>
          <Text style={styles.infoBannerText}>🏍️ No Bike Profile yet.</Text>
        </View>
      )}

      {/* LEGAL SECTION */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📜 Legal</Text>

        <TouchableOpacity
          style={styles.legalRow}
          onPress={() => navigation.navigate('TermsOfService')}
        >
          <Text style={styles.legalText}>📄 Terms of Service</Text>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.legalRow}
          onPress={() => navigation.navigate('DataPrivacy')}
        >
          <Text style={styles.legalText}>🔐 Data Privacy Notice</Text>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.legalRow}
          onPress={() => navigation.navigate('DataExportRequest')}
        >
          <Text style={styles.legalText}>📤 Request My Data Export</Text>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* LOGOUT BUTTON */}
      <View style={styles.logoutContainer}>
        <PrimaryButton
          label="🚪 Log Out"
          onPress={handleLogout}
          style={{ backgroundColor: colors.signalRed }}
        />
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  centerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: colors.signalRed,
    textAlign: 'center',
    marginTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: colors.inkSoft,
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.bodaOrange,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  key: {
    fontSize: 12,
    color: colors.inkSoft,
    fontWeight: '600',
  },
  value: {
    fontSize: 12,
    color: colors.ink,
    fontWeight: '700',
  },
  ghostBtn: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  ghostBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  selectContainer: {
    marginVertical: 10,
  },
  selectOption: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  selectOptionActive: {
    borderColor: colors.bodaOrange,
    backgroundColor: '#fff9f3',
  },
  selectOptionText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  selectOptionTextActive: {
    color: colors.bodaOrange,
  },
  cancelLink: {
    fontSize: 12,
    color: colors.bodaOrange,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 8,
  },
  infoBanner: {
    alignItems: 'center',
  },
  infoBannerText: {
    fontSize: 13,
    color: colors.inkSoft,
    fontWeight: '600',
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  legalText: {
    flex: 1,
    fontSize: 13,
    color: colors.ink,
    fontWeight: '600',
  },
  arrow: {
    fontSize: 18,
    color: colors.inkSoft,
  },
  logoutContainer: {
    marginBottom: 20,
    marginTop: 16,
  },
});