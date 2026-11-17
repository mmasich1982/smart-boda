// rider-app/src/navigation/rootNavigation.js
// A handle on the ROOT navigator (the one in OnboardingNavigator.js) so any screen, however deeply nested, can send the person
// to the Sign-In screen after an explicit Logout. (Old code reset to a route called 'Login', which does not exist.)
import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

/** Clear the whole navigation history and show the Login screen. `params` may carry { notice } (why the person was logged out). @returns {boolean} true when the reset was done */
export function resetToSignIn(params) {
  try {
    if (navigationRef.isReady()) {
      navigationRef.reset({ index: 0, routes: [{ name: 'PinLogin', params: params || undefined }] });
      return true;
    }
  } catch (err) {
    console.warn('[rootNavigation] resetToSignIn failed:', err?.message);
  }
  return false;
}

export default { navigationRef, resetToSignIn };
