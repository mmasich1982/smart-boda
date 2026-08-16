// rider-app/src/hooks/useMasterData.js
// FIXED: Corrected fuel type data structure to match backend API and component expectations
// Issue: FUEL_TYPES was using 'key' and 'label' instead of 'code' and 'display_name'
// This caused BikeProfileScreen dropdown mapping to fail: map((f) => ({ label: f.display_name, value: f.code }))

import { useState, useEffect } from 'react';
import { useToast } from '../components/Toast';
import api from '../api/client';

// Family relationships master data
const FAMILY_RELATIONSHIPS = [
  'Mother',
  'Father',
  'Spouse',
  'Child',
  'Sibling',
  'Grandparent',
  'Aunt',
  'Uncle',
  'Cousin',
  'Friend',
  'Other',
];

// Payment channels master data
const PAYMENT_CHANNELS = [
  { key: 'mpesa', label: 'M-Pesa' },
  { key: 'airtel_money', label: 'Airtel Money' },
  { key: 'bank_transfer', label: 'Bank Transfer' },
  { key: 'cash', label: 'Cash' },
  { key: 'other', label: 'Other' },
];

// FIXED: Fuel types now use correct field names to match backend API
// Backend API returns: { code: "petrol", display_name: "Petrol" }
// Component expects: f.code and f.display_name
const FUEL_TYPES = [
  { code: 'petrol', display_name: 'Petrol', emoji: '⛽', icon: 'fuel' },
  { code: 'electric', display_name: 'Electric', emoji: '🔋', icon: 'battery' },
];

// Service types master data
const SERVICE_TYPES = [
  { key: 'oil_change', label: 'Oil Change', icon: 'oil' },
  { key: 'tire_replacement', label: 'Tire Replacement', icon: 'tire' },
  { key: 'brake_service', label: 'Brake Service', icon: 'brake' },
  { key: 'battery_check', label: 'Battery Check', icon: 'battery' },
  { key: 'general_inspection', label: 'General Inspection', icon: 'inspection' },
  { key: 'washing', label: 'Washing', icon: 'wash' },
  { key: 'other', label: 'Other Service', icon: 'service' },
];

// Compliance document types
const DOCUMENT_TYPES = [
  { key: 'driving_license', label: 'Driving License', icon: 'license' },
  { key: 'vehicle_inspection', label: 'Vehicle Inspection Certificate', icon: 'inspection' },
  { key: 'insurance', label: 'Insurance Policy', icon: 'insurance' },
  { key: 'registration', label: 'Vehicle Registration', icon: 'registration' },
  { key: 'other', label: 'Other Document', icon: 'document' },
];

// Expense categories
const EXPENSE_CATEGORIES = [
  { key: 'fuel', label: 'Fuel' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'toll', label: 'Toll' },
  { key: 'parking', label: 'Parking' },
  { key: 'family_remittance', label: 'Family Remittance' },
  { key: 'other', label: 'Other' },
];

// Savings types
const SAVINGS_TYPES = [
  { key: 'personal_savings', label: 'Personal Savings Account' },
  { key: 'emergency_fund', label: 'Emergency Fund' },
  { key: 'vehicle_upgrade', label: 'Vehicle Upgrade Fund' },
  { key: 'health_fund', label: 'Health & Medical Fund' },
  { key: 'education', label: 'Education Fund' },
];

// Goal types
const GOAL_TYPES = [
  { key: 'vehicle_upgrade', label: 'Vehicle Upgrade' },
  { key: 'home_improvement', label: 'Home Improvement' },
  { key: 'education', label: 'Education' },
  { key: 'health', label: 'Health & Medical' },
  { key: 'emergency_fund', label: 'Emergency Fund' },
  { key: 'savings', label: 'Savings Goal' },
];

// Languages
const LANGUAGES = [
  { code: 'en', display_name: 'English', emoji: '🇬🇧' },
  { code: 'sw', display_name: 'Kiswahili', emoji: '🇰🇪' },
];

// Data Export Reasons
const DATA_EXPORT_REASONS = [
  { code: 'personal_records', display_name: 'Personal Records' },
  { code: 'account_closure', display_name: 'Account Closure' },
  { code: 'data_portability', display_name: 'Data Portability' },
  { code: 'other', display_name: 'Other' },
];

export const useMasterData = () => {
  const [masterData, setMasterData] = useState({
    familyRelationships: FAMILY_RELATIONSHIPS,
    paymentChannels: PAYMENT_CHANNELS,
    fuelTypes: FUEL_TYPES,
    serviceTypes: SERVICE_TYPES,
    documentTypes: DOCUMENT_TYPES,
    expenseCategories: EXPENSE_CATEGORIES,
    savingsTypes: SAVINGS_TYPES,
    goalTypes: GOAL_TYPES,
    languages: LANGUAGES,
    dataExportReasons: DATA_EXPORT_REASONS,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { showToast } = useToast();

  useEffect(() => {
    loadMasterData();
  }, []);

  const loadMasterData = async () => {
    try {
      setLoading(true);
      
      // ENHANCEMENT: Optionally fetch fuel types from backend API for real-time updates
      // This allows admins to add new fuel types without app release
      // Uncomment the code below to enable backend API fetching:
      /*
      const fuelTypesResponse = await api.get('/onboarding/fuel-types');
      const backendFuelTypes = fuelTypesResponse.data;
      
      setMasterData({
        familyRelationships: FAMILY_RELATIONSHIPS,
        paymentChannels: PAYMENT_CHANNELS,
        fuelTypes: backendFuelTypes, // Use backend data if available
        serviceTypes: SERVICE_TYPES,
        documentTypes: DOCUMENT_TYPES,
        expenseCategories: EXPENSE_CATEGORIES,
        savingsTypes: SAVINGS_TYPES,
        goalTypes: GOAL_TYPES,
        languages: LANGUAGES,
        dataExportReasons: DATA_EXPORT_REASONS,
      });
      */
      
      // For MVP0, use hardcoded values (most performant, no API call needed)
      setMasterData({
        familyRelationships: FAMILY_RELATIONSHIPS,
        paymentChannels: PAYMENT_CHANNELS,
        fuelTypes: FUEL_TYPES,
        serviceTypes: SERVICE_TYPES,
        documentTypes: DOCUMENT_TYPES,
        expenseCategories: EXPENSE_CATEGORIES,
        savingsTypes: SAVINGS_TYPES,
        goalTypes: GOAL_TYPES,
        languages: LANGUAGES,
        dataExportReasons: DATA_EXPORT_REASONS,
      });
      setError(null);
    } catch (err) {
      console.error('Error loading master data:', err);
      setError(err.message);
      showToast('Error loading master data', 'error');
      
      // Fallback to hardcoded values on API error
      setMasterData({
        familyRelationships: FAMILY_RELATIONSHIPS,
        paymentChannels: PAYMENT_CHANNELS,
        fuelTypes: FUEL_TYPES,
        serviceTypes: SERVICE_TYPES,
        documentTypes: DOCUMENT_TYPES,
        expenseCategories: EXPENSE_CATEGORIES,
        savingsTypes: SAVINGS_TYPES,
        goalTypes: GOAL_TYPES,
        languages: LANGUAGES,
        dataExportReasons: DATA_EXPORT_REASONS,
      });
    } finally {
      setLoading(false);
    }
  };

  return {
    ...masterData,
    loading,
    error,
    reload: loadMasterData,
  };
};

export default useMasterData;