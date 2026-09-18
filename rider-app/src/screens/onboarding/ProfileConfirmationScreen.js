// rider-app/src/screens/onboarding/ProfileConfirmationScreen.js
// ENHANCED: Added searchable County, Sub-County, and Ward fields with intelligent filtering
// Pattern matches "Select Member" searchable dropdown behavior from admin dashboard

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import Checkbox from 'expo-checkbox';
import NetInfo from '@react-native-community/netinfo';
import OnboardingProgressBar from '../../components/OnboardingProgressBar';
import FormField from '../../components/FormField';
import PrimaryButton from '../../components/PrimaryButton';
import { useTranslation } from '../../i18n/LocalizationProvider';
import api from '../../api/client';
import { CURRENT_TERMS_VERSION } from '../../constants/legal';
import { saveLocalRiderStatus, saveLocalRiderId } from '../../offline/db';

/**
 * SearchableLocationDropdown Component
 * Reusable searchable dropdown for County, Sub-County, and Ward selection
 * Behavior matches "Select Member" field from Register Member to Sacco screen
 */
const SearchableLocationDropdown = ({
  label,
  value,
  onSelect,
  options,
  loading,
  error,
  placeholder,
  searchableFields = ['name'],
}) => {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [filteredOptions, setFilteredOptions] = useState(options);

  // Filter options based on search input
  useEffect(() => {
    if (!search.trim()) {
      setFilteredOptions(options);
      return;
    }

    const searchLower = search.toLowerCase();
    const filtered = options.filter(option => {
      // Search across all searchable fields (typically 'name')
      return searchableFields.some(field => 
        (option[field] || '').toLowerCase().includes(searchLower)
      );
    });
    setFilteredOptions(filtered);
  }, [search, options, searchableFields]);

  const selectedOptionName = options.find(opt => opt.id === value)?.name || '';

  const handleSelectOption = (option) => {
    onSelect(option.id, option.name);
    setSearch('');
    setIsOpen(false);
  };

  return (
    <View style={styles.dropdownContainer}>
      <Text style={styles.label}>{label}</Text>
      
      {/* Search Input Field */}
      <TouchableOpacity 
        onPress={() => setIsOpen(!isOpen)}
        style={[styles.dropdownInput, error && styles.dropdownInputError]}
      >
        <TextInput
          style={styles.searchInput}
          placeholder={placeholder || 'Search...'}
          value={isOpen ? search : selectedOptionName}
          onChangeText={setSearch}
          onFocus={() => setIsOpen(true)}
          editable={isOpen}
          placeholderTextColor="#999"
        />
        <Text style={styles.dropdownIcon}>{isOpen ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {/* Error Message */}
      {error && <Text style={styles.errorText}>⚠️ {error}</Text>}

      {/* Dropdown Options List */}
      {isOpen && (
        <View style={styles.dropdownList}>
          {loading ? (
            <ActivityIndicator size="small" color="#e5650a" style={styles.loadingIndicator} />
          ) : filteredOptions.length > 0 ? (
            <FlatList
              data={filteredOptions}
              keyExtractor={(item) => item.id.toString()}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.dropdownOption,
                    value === item.id && styles.dropdownOptionSelected,
                  ]}
                  onPress={() => handleSelectOption(item)}
                >
                  <Text style={[
                    styles.dropdownOptionText,
                    value === item.id && styles.dropdownOptionTextSelected,
                  ]}>
                    {item.name}
                  </Text>
                  {value === item.id && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              )}
            />
          ) : (
            <Text style={styles.noResults}>No results found</Text>
          )}
        </View>
      )}
    </View>
  );
};

/**
 * ProfileConfirmationScreen
 * Enhanced with searchable location fields for County, Sub-County, and Ward
 * SB-03-B: Onboarding step 4 of 5
 */
export default function ProfileConfirmationScreen({ route, navigation }) {
  const { riderId } = route.params || {};
  const { t } = useTranslation();

  // Form state
  const [fullName, setFullName] = useState('');
  const [nameError, setNameError] = useState(null);
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(null);
  const [online, setOnline] = useState(true);

  // Location state
  const [selectedCountyId, setSelectedCountyId] = useState(null);
  const [selectedSubCountyId, setSelectedSubCountyId] = useState(null);
  const [selectedWardId, setSelectedWardId] = useState(null);

  // Dropdown data
  const [counties, setCounties] = useState([]);
  const [subCounties, setSubCounties] = useState([]);
  const [wards, setWards] = useState([]);

  // Loading and error states
  const [countyLoading, setCountyLoading] = useState(false);
  const [subCountyLoading, setSubCountyLoading] = useState(false);
  const [wardLoading, setWardLoading] = useState(false);
  const [countyError, setCountyError] = useState(null);
  const [subCountyError, setSubCountyError] = useState(null);
  const [wardError, setWardError] = useState(null);

  // Fetch counties on mount
  useEffect(() => {
    fetchCounties();
    const unsubscribe = NetInfo.addEventListener((state) => setOnline(!!state.isConnected));
    return unsubscribe;
  }, []);

  // Fetch sub-counties when county changes
  useEffect(() => {
    if (selectedCountyId) {
      fetchSubCounties(selectedCountyId);
      setSelectedSubCountyId(null);
      setSelectedWardId(null);
      setSubCounties([]);
      setWards([]);
    }
  }, [selectedCountyId]);

  // Fetch wards when sub-county changes
  useEffect(() => {
    if (selectedSubCountyId) {
      fetchWards(selectedSubCountyId);
      setSelectedWardId(null);
      setWards([]);
    }
  }, [selectedSubCountyId]);

  // API: Fetch all counties
  async function fetchCounties() {
    try {
      setCountyLoading(true);
      setCountyError(null);
      const response = await api.get('/location-data/counties');
      setCounties(response.data.data.map(county => ({
        id: county.id,
        name: county.name,
      })));
    } catch (err) {
      setCountyError(t('profile.location_fetch_error') || 'Failed to load counties');
      console.error('Error fetching counties:', err);
    } finally {
      setCountyLoading(false);
    }
  }

  // API: Fetch sub-counties for selected county
  async function fetchSubCounties(countyId) {
    try {
      setSubCountyLoading(true);
      setSubCountyError(null);
      const response = await api.get(`/location-data/sub-counties`, {
        params: { county_id: countyId }
      });
      setSubCounties(response.data.data.map(subCounty => ({
        id: subCounty.id,
        name: subCounty.name,
      })));
    } catch (err) {
      setSubCountyError(t('profile.location_fetch_error') || 'Failed to load sub-counties');
      console.error('Error fetching sub-counties:', err);
    } finally {
      setSubCountyLoading(false);
    }
  }

  // API: Fetch wards for selected sub-county
  async function fetchWards(subCountyId) {
    try {
      setWardLoading(true);
      setWardError(null);
      const response = await api.get(`/location-data/wards`, {
        params: { sub_county_id: subCountyId }
      });
      setWards(response.data.data.map(ward => ({
        id: ward.id,
        name: ward.name,
      })));
    } catch (err) {
      setWardError(t('profile.location_fetch_error') || 'Failed to load wards');
      console.error('Error fetching wards:', err);
    } finally {
      setWardLoading(false);
    }
  }

  // Handle location selection
  const handleCountySelect = (countyId, countyName) => {
    setSelectedCountyId(countyId);
  };

  const handleSubCountySelect = (subCountyId, subCountyName) => {
    setSelectedSubCountyId(subCountyId);
  };

  const handleWardSelect = (wardId, wardName) => {
    setSelectedWardId(wardId);
  };

  // Form submission
  async function handleContinue() {
    let ok = true;
    
    // Validate full name
    if (!fullName.trim()) {
      setNameError(t('profile.name_required'));
      ok = false;
    } else {
      setNameError(null);
    }

    // Validate location selection
    if (!selectedCountyId) {
      setCountyError(t('profile.county_required') || 'Please select a county');
      ok = false;
    } else {
      setCountyError(null);
    }

    if (!selectedSubCountyId) {
      setSubCountyError(t('profile.sub_county_required') || 'Please select a sub-county');
      ok = false;
    } else {
      setSubCountyError(null);
    }

    if (!selectedWardId) {
      setWardError(t('profile.ward_required') || 'Please select a ward');
      ok = false;
    } else {
      setWardError(null);
    }

    // Validate consent
    if (!consent) {
      setConsentError(t('profile.consent_required'));
      ok = false;
    } else {
      setConsentError(null);
    }

    if (!ok) return;

    try {
      // Submit profile with location data
      await api.post('/onboarding/profile-confirm', {
        full_name: fullName.trim(),
        county_id: selectedCountyId,
        sub_county_id: selectedSubCountyId,
        ward_id: selectedWardId,
        consent_accepted: true,
        consent_content_version: CURRENT_TERMS_VERSION,
      }, {
        params: { rider_id: riderId }
      });

      // Persist rider_id
      if (riderId) {
        await saveLocalRiderStatus({
          rider_id: riderId,
          onboarding_step: 'createPin',
          county_id: selectedCountyId,
          sub_county_id: selectedSubCountyId,
          ward_id: selectedWardId,
        });
        await saveLocalRiderId(riderId);
        console.log('[ProfileConfirmation] Saved rider_id:', riderId);
      }

      navigation.navigate('CreatePin', { riderId });
    } catch (err) {
      if (err.response?.status === 409) {
        setNameError(t('profile.name_duplicate'));
      } else {
        setNameError(t('profile.save_error'));
      }
      console.error('Error saving profile:', err);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.backLink} onPress={() => navigation.goBack()}>← Back</Text>
      <OnboardingProgressBar currentStep="profileConfirm" />
      <Text style={styles.title}>{t('profile.title')}</Text>

      {/* Full Name Field */}
      <FormField
        label={t('profile.name_label')}
        value={fullName}
        onChangeText={setFullName}
        maxLength={80}
        placeholder={t('profile.name_placeholder')}
        error={nameError}
        required={true}
      />
      <Text style={styles.hint}>{t('profile.name_hint')}</Text>

      {/* Location Selection Section */}
      <Text style={styles.sectionTitle}>{t('profile.location_title') || 'Operating Location'}</Text>

      {/* County Dropdown */}
      <SearchableLocationDropdown
        label={t('profile.county_label') || 'County'}
        value={selectedCountyId}
        onSelect={handleCountySelect}
        options={counties}
        loading={countyLoading}
        error={countyError}
        placeholder={t('profile.county_placeholder') || 'Search county...'}
      />

      {/* Sub-County Dropdown */}
      <SearchableLocationDropdown
        label={t('profile.sub_county_label') || 'Sub-County'}
        value={selectedSubCountyId}
        onSelect={handleSubCountySelect}
        options={subCounties}
        loading={subCountyLoading}
        error={subCountyError}
        placeholder={t('profile.sub_county_placeholder') || 'Search sub-county...'}
      />

      {/* Ward Dropdown */}
      <SearchableLocationDropdown
        label={t('profile.ward_label') || 'Ward'}
        value={selectedWardId}
        onSelect={handleWardSelect}
        options={wards}
        loading={wardLoading}
        error={wardError}
        placeholder={t('profile.ward_placeholder') || 'Search ward...'}
      />

      {/* Consent Checkbox */}
      <View style={styles.checkboxRow}>
        <Checkbox value={consent} onValueChange={setConsent} color={consent ? '#ffc107' : undefined} />
        <Text style={styles.consentLabel}>
          {t('profile.consent_prefix')}{' '}
          <Text style={styles.link} onPress={() => navigation.navigate('TermsOfService')}>
            {t('profile.terms_link')}
          </Text>
          {' '}{t('profile.consent_middle')}{' '}
          <Text style={styles.link} onPress={() => navigation.navigate('DataPrivacy')}>
            {t('profile.privacy_link')}
          </Text>
          {t('profile.consent_suffix')}
        </Text>
      </View>
      {consentError && <Text style={styles.error}>⚠️ {consentError}</Text>}

      {/* Online/Offline Status Badge */}
      <View style={[styles.badge, online ? styles.badgeGreen : styles.badgeAmber]}>
        <Text style={[styles.badgeText, online ? styles.badgeTextGreen : styles.badgeTextAmber]}>
          {online ? t('profile.online_badge') : t('profile.offline_badge')}
        </Text>
      </View>

      {/* Continue Button */}
      <PrimaryButton
        label={t('profile.continue')}
        onPress={handleContinue}
        disabled={!fullName || !consent || !selectedCountyId || !selectedSubCountyId || !selectedWardId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    padding: 20,
  },
  backLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5b606c',
    marginBottom: 10,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1a1c20',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
    marginTop: 16,
    marginBottom: 12,
  },
  hint: {
    fontSize: 11,
    color: '#5b606c',
    marginTop: -8,
    marginBottom: 14,
  },

  // Dropdown Styles (matching Select Member field behavior)
  dropdownContainer: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1c20',
    marginBottom: 6,
  },
  dropdownInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  dropdownInputError: {
    borderColor: '#e0453f',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#1a1c20',
    padding: 0,
  },
  dropdownIcon: {
    fontSize: 12,
    color: '#5b606c',
    marginLeft: 8,
  },
  errorText: {
    color: '#e0453f',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '700',
  },

  // Dropdown List Styles
  dropdownList: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7e4db',
    borderRadius: 8,
    marginTop: -1,
    maxHeight: 200,
    zIndex: 1000,
  },
  loadingIndicator: {
    paddingVertical: 16,
  },
  dropdownOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0ede4',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownOptionSelected: {
    backgroundColor: '#fff3e0',
  },
  dropdownOptionText: {
    fontSize: 13,
    color: '#1a1c20',
    flex: 1,
  },
  dropdownOptionTextSelected: {
    fontWeight: '600',
    color: '#e5650a',
  },
  checkmark: {
    fontSize: 16,
    color: '#e5650a',
    fontWeight: '700',
  },
  noResults: {
    fontSize: 12,
    color: '#5b606c',
    textAlign: 'center',
    paddingVertical: 16,
    fontStyle: 'italic',
  },

  // Checkbox Row Styles
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 13,
    padding: 12,
    marginBottom: 14,
  },
  consentLabel: {
    fontSize: 11,
    color: '#5b606c',
    flex: 1,
    lineHeight: 17,
  },
  link: {
    color: '#e5650a',
    fontWeight: '700',
  },
  error: {
    color: '#e0453f',
    fontSize: 11,
    marginBottom: 10,
    fontWeight: '700',
  },

  // Badge Styles
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 11,
    marginBottom: 16,
  },
  badgeGreen: {
    backgroundColor: '#e6f5ef',
  },
  badgeAmber: {
    backgroundColor: '#fdf3df',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextGreen: {
    color: '#1e9e6f',
  },
  badgeTextAmber: {
    color: '#c98a12',
  },
});