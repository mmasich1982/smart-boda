// rider-app/src/navigation/OnboardingNavigator.js
/**
 * ONBOARDING & AUTH NAVIGATOR - CORRECTED VERSION
 * ✅ FIXED: Import PinLoginScreen from /auth/ path (was /onboarding/)
 * ✅ PRESERVED: Original structure with "Home" screen name
 * ✅ ADDED: Loading/error handling for initialization
 * 
 * KEY FIX: This version imports from the CORRECT PinLoginScreen path
 * which has proper route.params null-checking to prevent blank pages
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text } from 'react-native';

// ✅ ORIGINAL ONBOARDING SCREENS (correct paths)
import LanguageSelectionScreen from '../screens/onboarding/LanguageSelectionScreen';
import ValuePreviewScreen from '../screens/onboarding/ValuePreviewScreen';
import BikeProfileScreen from '../screens/onboarding/BikeProfileScreen';
import MobileNumberScreen from '../screens/onboarding/MobileNumberScreen';
import ProfileConfirmationScreen from '../screens/onboarding/ProfileConfirmationScreen';
import CreatePinScreen from '../screens/onboarding/CreatePinScreen';


// ✅ CRITICAL FIX: Import PinLoginScreen from /auth/ path (NOT /onboarding/)
// The /auth/ version has proper null-checking for route.params
import PinLoginScreen from '../screens/auth/PinLoginScreen';pin

// ✅ FORGOT PIN SCREENS (if they exist in auth folder)
import ForgotPinScreen from '../screens/auth/ForgotPinScreen';
import ForgotPinConfirmationScreen from '../screens/auth/ForgotPinConfirmationScreen';

// ✅ MAIN APP NAVIGATOR
import MainNavigator from './MainNavigator';

// DATABASE
import { getLocalRiderStatus } from '../offline/db';

const Stack = createNativeStackNavigator();

/**
 * INITIALIZATION LOGIC
 * Determines which screen to show on cold start:
 * 1. LanguageSelection - first time ever
 * 2. PinLogin - returning registered rider
 * 3. Mid-onboarding step - resume where left off
 */
function useInitialRoute() {
  const [route, setRoute] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    (async () => {
      try {
        const status = await getLocalRiderStatus();
        
        if (!status) {
          // First time user
          setRoute('LanguageSelection');
          return;
        }
        
        if (status.registration_status === 'active') {
          // Returning registered user
          setRoute('PinLogin');
          return;
        }

        // Mid-onboarding - resume at exact step
        const stepToScreen = {
          valuePreview: 'ValuePreview',
          bikeProfile: 'BikeProfile',
          number: 'MobileNumber',
          profileConfirm: 'ProfileConfirmation',
          createPin: 'CreatePin',
        };
        
        const resumeScreen = stepToScreen[status.onboarding_step];
        setRoute(resumeScreen || 'LanguageSelection');
      } catch (err) {
        console.error('Failed to load rider status during initialization:', err);
        setError(err);
        // Fallback to first-time user experience
        setRoute('LanguageSelection');
      }
    })();
  }, []);

  return { route, error };
}

/**
 * LOADING SCREEN
 * Shows while app is determining which screen to load
 */
function LoadingScreen() {
  return (
    <View style={{
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#f6f4ef',
    }}>
      <Text style={{
        fontSize: 16,
        color: '#333',
        fontWeight: '600',
        marginBottom: 12,
      }}>
        🏍️ Loading Smart Boda...
      </Text>
      <Text style={{
        fontSize: 12,
        color: '#999',
      }}>
        Getting your account ready
      </Text>
    </View>
  );
}

/**
 * ERROR SCREEN
 * Shows if initialization fails
 */
function ErrorScreen({ error }) {
  return (
    <View style={{
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#f6f4ef',
      padding: 20,
    }}>
      <Text style={{
        fontSize: 18,
        color: '#d32f2f',
        textAlign: 'center',
        marginBottom: 10,
        fontWeight: '700',
      }}>
        ⚠️ Error Loading App
      </Text>
      <Text style={{
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 20,
      }}>
        {error?.message || 'An unexpected error occurred. Please try restarting the app.'}
      </Text>
      <Text style={{
        fontSize: 11,
        color: '#999',
        textAlign: 'center',
        fontFamily: 'monospace',
        marginBottom: 20,
      }}>
        {error?.stack?.split('\n')[0] || 'Unknown error'}
      </Text>
      <Text style={{
        fontSize: 12,
        color: '#666',
        textAlign: 'center',
      }}>
        If this persists, please contact support:
      </Text>
      <Text style={{
        fontSize: 12,
        color: '#333',
        textAlign: 'center',
        fontWeight: '600',
        marginTop: 8,
      }}>
        📞 +254 757 334481
      </Text>
    </View>
  );
}

/**
 * MAIN ONBOARDING NAVIGATOR
 * 
 * ✅ CRITICAL: "Home" screen name is REQUIRED
 * The PinLoginScreen navigates to "Home" using:
 * navigation.reset({ index: 0, routes: [{ name: 'Home' }] })
 * 
 * "Home" is defined at line 134 as MainNavigator component
 */
export default function OnboardingNavigator() {
  const { route: initialRoute, error } = useInitialRoute();

  // Show error screen if initialization failed
  if (error) {
    return <ErrorScreen error={error} />;
  }

  // Show loading screen while determining initial route
  if (!initialRoute) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerShown: false,
          animationEnabled: true,
        }}
      >
        {/* FIRST-TIME ONBOARDING FLOW */}
        <Stack.Screen 
          name="LanguageSelection" 
          component={LanguageSelectionScreen} 
        />
        <Stack.Screen 
          name="ValuePreview" 
          component={ValuePreviewScreen} 
        />
        <Stack.Screen 
          name="BikeProfile" 
          component={BikeProfileScreen} 
        />
        <Stack.Screen 
          name="MobileNumber" 
          component={MobileNumberScreen} 
        />
        <Stack.Screen 
          name="ProfileConfirmation" 
          component={ProfileConfirmationScreen} 
        />
        <Stack.Screen 
          name="CreatePin" 
          component={CreatePinScreen} 
        />

        {/* PIN LOGIN & RECOVERY (for returning/registered riders) */}
        {/* ✅ CRITICAL: Import is NOW from /auth/ path (was /onboarding/) */}
        <Stack.Screen 
          name="PinLogin" 
          component={PinLoginScreen} 
        />
        <Stack.Screen 
          name="ForgotPin" 
          component={ForgotPinScreen} 
        />
        <Stack.Screen 
          name="ForgotPinConfirmation" 
          component={ForgotPinConfirmationScreen} 
        />

        {/* ✅ CRITICAL: Screen name MUST be "Home" (not "MainApp") */}
        {/* This is what PinLoginScreen navigates to after successful login */}
        <Stack.Screen
          name="Home"
          component={MainNavigator}
          options={{
            animationEnabled: false, // Smooth transition without animation
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

/**
 * NAVIGATION REFERENCE
 * 
 * Screen Names Available:
 * - "LanguageSelection" → First time user picks language
 * - "ValuePreview" → Onboarding step 1
 * - "BikeProfile" → Onboarding step 2
 * - "MobileNumber" → Onboarding step 3
 * - "ProfileConfirmation" → Onboarding step 4
 * - "CreatePin" → Onboarding step 5
 * - "PinLogin" → Registered user login
 * - "ForgotPin" → Forgot PIN flow
 * - "ForgotPinConfirmation" → Confirmation screen
 * - "TermsOfService" → Legal screen
 * - "DataPrivacy" → Privacy screen
 * - "Home" → Main app (MainNavigator) - returned riders go here after login
 * 
 * What happens after successful PIN login:
 * PinLoginScreen calls:
 *   navigation.reset({
 *     index: 0,
 *     routes: [{ name: 'Home' }]  // ← MUST match screen name above
 *   });
 */