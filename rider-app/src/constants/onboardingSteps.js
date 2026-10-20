// rider-app/src/constants/onboardingSteps.js
// Onboarding: Language -> Value Preview -> Setup My Profile -> Create Your Login PIN (enter + confirm) -> Home.
// The old 'bikeProfile', 'number' and 'profileConfirm' steps are gone; Setup My Profile does all three jobs.
export const ONBOARDING_STEPS = [
  'valuePreview',
  'setupProfile',
  'createPin',
];

export const ONBOARDING_STEP_LABELS = {
  valuePreview: 'Preview',
  setupProfile: 'Profile',
  createPin: 'PIN',
};
