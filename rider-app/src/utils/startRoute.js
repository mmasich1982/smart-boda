// rider-app/src/utils/startRoute.js
// PERSISTENT SESSION: which screen the app opens on a cold start. Kept out of the navigator so it can be tested without a phone.
//   * first time ever / half-way through onboarding  -> the onboarding screen to resume (unchanged)
//   * registered person who did NOT choose Logout     -> 'Home' straight away (no Sign-In screen)
//   * registered person who explicitly chose Logout   -> 'PinLogin'
// `status` is what getLocalRiderStatus() returns; `loggedOut` is isLoggedOut() (true only after an explicit Logout).
// SMART APPS: the LOGIN screen is the first thing a new person sees (it has Log In, Forgot PIN and Register). Register leads to Language Selection,
// the first screen of the existing onboarding. Language Selection is therefore no longer a start route.
// ADMIN APP: an Administrator is kept under `admin_id` (never `rider_id`, so no rider job ever runs for them). The same rules apply.
const STEP_TO_SCREEN = { valuePreview: 'ValuePreview', setupProfile: 'SetupProfile', createPin: 'CreatePin' };

export function resolveStartRoute(status, loggedOut) {
  if (!status) return 'PinLogin';
  if (status.user_type === 'admin') {
    if (status.registration_status === 'active') return status.admin_id && !loggedOut ? 'Home' : 'PinLogin';
    return STEP_TO_SCREEN[status.onboarding_step] || 'PinLogin';
  }
  if (status.registration_status === 'active') {
    if (!status.rider_id) return 'PinLogin';          // nothing on this phone to open Home with: let the person sign in
    return loggedOut ? 'PinLogin' : 'Home';
  }
  return STEP_TO_SCREEN[status.onboarding_step] || 'PinLogin';       // half-way through registering: resume there; otherwise the Login screen
}

export default { resolveStartRoute };
