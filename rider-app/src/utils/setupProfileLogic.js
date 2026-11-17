// rider-app/src/utils/setupProfileLogic.js
// SETUP MY PROFILE rules, kept out of the screen so they can be tested without a phone. One app serves two kinds of person:
//   a RIDER (belongs to a Treasurer's group, or was pre-registered as an individual rider)  -> chooses a FUEL TYPE
//   a BUSINESS user (Business Owner or Sales/Service Person registered by the Admin)         -> chooses a BUSINESS TYPE
// ADMIN APP: a third kind of person, an ADMINISTRATOR (admin_user table), sets up with the same screens: number -> name -> terms -> PIN.
//   An Administrator chooses NOTHING: no fuel type and no business type are shown.
// The server decides which one a mobile number is (GET /onboarding/profile-lookup); the app never guesses.
export const KENYA_MSISDN = /^(\+254|254|0)(7|1)\d{8}$/;
export const cleanMobile = (v) => (v || '').replace(/[\s-]/g, '');

// 'business' or 'admin' only when the server says so; everything else (including older servers that send no user_type) is a rider.
export const userTypeFromLookup = (data) => (data && data.user_type === 'business' ? 'business' : data && data.user_type === 'admin' ? 'admin' : 'rider');
export const isAdminType = (userType) => userType === 'admin';

// The ONE choice a person must make once their number is found: a rider chooses the fuel type. A business user (Owner or Sales/Service Person)
// chooses NOTHING: the Business Type was set by the Smart Bizna Administrator at pre-registration, so they only finish the registration.
export const choiceFor = (userType) => (userType === 'business' || userType === 'admin' ? null : 'fuel_type');

// A business user is shown the Business Type the Smart Bizna Administrator chose, READ-ONLY, under their name (they never choose it). The text comes from
// the server lookup (its display name; the code only as a last resort so the field is never blank); riders have none.
export const businessTypeLabel = (data) => {
  if (!data || userTypeFromLookup(data) !== 'business') return '';
  return data.business_type_name || data.business_type_code || '';
};
export const showBusinessTypeField = (lookup, userType) => lookup === 'found' && userType === 'business';

// Which sentence sits under the read-only Full Name. A rider registered by a Treasurer is told it is their Treasurer's record;
// an individual rider or a business user is told it is their Admin's record.
export function nameHintKey(lookup, source) {
  if (lookup === 'looking') return 'setup.looking_up';
  if (lookup === 'offline') return 'setup.need_connection';
  if (lookup === 'found') return source === 'admin' ? 'setup.name_hint_account' : source === 'member' || source === 'treasurer' ? 'setup.name_hint' : 'setup.name_hint_admin';
  return 'setup.name_waiting';
}
export const NAME_HINT_DEFAULTS = {
  'setup.looking_up': 'Looking up your number…',
  'setup.need_connection': 'Connect to the internet to find your name, then continue.',
  'setup.name_hint': 'This is the name your Group Treasurer registered.',
  'setup.name_hint_admin': 'This is the name your Admin registered.',
  'setup.name_hint_account': 'This is the name on your Administrator account.',
  'setup.name_waiting': 'Enter your mobile number to see your name.',
};

// Continue stays off until the number is found, the terms are accepted and (riders only) the fuel type is chosen.
export function canContinue({ lookup, userType, fuelType, consent, saving }) {
  if (saving || lookup !== 'found' || !consent) return false;
  return userType === 'business' || userType === 'admin' ? true : !!fuelType;
}

// The request body for POST /onboarding/setup-profile. A rider sends a fuel type; a business user sends neither a fuel type nor a business type.
export function buildSetupBody({ mobile, userType, fuelType, language, termsVersion }) {
  const body = { mobile_number: cleanMobile(mobile), consent_accepted: true, consent_content_version: termsVersion, language_code: language };
  if (userType !== 'business' && userType !== 'admin') body.fuel_type_code = fuelType;
  return body;
}

// What is kept on the phone (saveLocalRiderStatus) after a successful setup. Business details ride in the same record, so Home
// can later pick the right experience even offline. The existing fields are exactly as before.
export function localStatusFrom(res, fallbackName) {
  if (res.user_type === 'admin') {          // ADMIN APP: kept under admin_id, NEVER rider_id, so no rider job (sync, Chama, subscription) ever runs for an Administrator
    return { admin_id: res.admin_id, onboarding_step: 'createPin', registration_status: 'verified_incomplete', mobile_number: res.mobile_number,
      full_name: res.full_name || fallbackName, role: res.role, user_type: 'admin' };
  }
  const base = {
    rider_id: res.rider_id,
    onboarding_step: 'createPin',
    registration_status: 'verified_incomplete',
    mobile_number: res.mobile_number,
    full_name: res.full_name || fallbackName,
    county_id: res.county_id,
    sub_county_id: res.sub_county_id,
    ward_id: res.ward_id,
    user_type: res.user_type === 'business' ? 'business' : 'rider',
  };
  if (res.user_type === 'business') {
    return { ...base, role: res.role, business_id: res.business_id, business_name: res.business_name, business_type_code: res.business_type_code, business_type_name: res.business_type_name,
      business_user_id: res.business_user_id };
  }
  return base;
}
