// rider-app/src/hooks/useOnboardingNavigation.js
// Issue 13 fix: Custom hook to manage onboarding screen navigation with proper state handling
// Ensures previous screens remain in the navigation stack for proper back navigation

import React, { createContext, useContext, useState } from 'react';

const OnboardingContext = createContext();

// Provider component to wrap the onboarding flow
export function OnboardingProvider({ children }) {
  const [formState, setFormState] = useState({
    language: null,
    bikeProfile: null,
    mobileNumber: null,
    fullName: null,
  });

  const updateFormState = (key, value) => {
    setFormState(prev => ({ ...prev, [key]: value }));
  };

  return (
    <OnboardingContext.Provider value={{ formState, updateFormState }}>
      {children}
    </OnboardingContext.Provider>
  );
}

// Hook to use onboarding context
export function useOnboardingState() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboardingState must be used within OnboardingProvider');
  }
  return context;
}

// Hook to manage navigation between onboarding screens with proper stack handling
export function useOnboardingNavigation(navigation) {
  const { formState, updateFormState } = useOnboardingState();

  const navigateToScreen = (screenName, params = {}) => {
    // Use navigate() instead of replace() to preserve the back stack
    // This allows proper back button functionality
    navigation.navigate(screenName, params);
  };

  const navigateBack = () => {
    // Proper back navigation that preserves state
    navigation.goBack();
  };

  const navigateToMobileNumber = (bikeData) => {
    // Preserve bike profile data before navigating
    updateFormState('bikeProfile', bikeData);
    navigateToScreen('MobileNumber', { bikeData });
  };

  const navigateToProfileConfirmation = (mobileData, riderId) => {
    // Preserve mobile number data before navigating
    updateFormState('mobileNumber', mobileData);
    // Use navigate() instead of replace() to allow back navigation
    navigateToScreen('ProfileConfirmation', { 
      mobileData,
      riderId 
    });
  };

  const navigateToCreatePin = (profileData, riderId) => {
    // Preserve profile data before navigating
    updateFormState('fullName', profileData);
    // Final step - use navigate() to maintain navigation stack
    navigateToScreen('CreatePin', { 
      profileData,
      riderId 
    });
  };

  return {
    navigateToScreen,
    navigateBack,
    navigateToMobileNumber,
    navigateToProfileConfirmation,
    navigateToCreatePin,
    formState,
  };
}