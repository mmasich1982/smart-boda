// rider-app/src/vehicle/vehicleWords.js
// SMART CABZ: the words a person sees follow their KIND of user (the same rules as the server: backend/app/services/vehicle_words.py).
//   rider    (motorcycle)  Smart Boda  -> text is never changed
//   driver   (car)         Smart Cabz  -> motorcycle / motorbike / bike -> car, rider -> driver, Smart Boda -> Smart Cabz, 🏍️ -> 🚗 (Kiswahili: Bajaji -> Dereva, motosikeli / pikipiki -> gari)
//   business (Smart Bizna) Smart Bizna -> only the brand: Smart Boda -> Smart Bizna
// Plain functions, no phone needed, so they can be tested.
export const RIDER = 'rider';
export const DRIVER = 'driver';
export const BUSINESS = 'business';
export const CHAMA = 'chama';          // SMART CHAMA: brand only, plus riders -> members

/** Which words this saved status reads: business user -> business; car -> driver; everything else (and an Administrator) -> rider. */
export function audienceFor(status) {
  if (!status) return RIDER;
  if (status.user_type === 'business') return BUSINESS;
  if (status.user_type === 'admin') return RIDER;
  if (status.user_type === 'chama') return CHAMA;
  return status.vehicle_type === 'car' ? DRIVER : RIDER;
}

const keepCase = (word, repl) => {
  if (word.length > 1 && word === word.toUpperCase()) return repl.toUpperCase();
  if (word[0] !== word[0].toLowerCase()) return repl[0].toUpperCase() + repl.slice(1);
  return repl;
};
const word = (re, one, many) => [re, (w) => keepCase(w, many && /s$/i.test(w) && !/ss$/i.test(w) ? many : one)];

const DRIVER_RULES = [
  [/Smart Boda/g, () => 'Smart Cabz'],
  [/\u{1F3CD}\uFE0F?/gu, () => '\u{1F697}'],
  word(/\bmotor ?bikes?\b|\bmotorcycles?\b|\bbikes?\b/gi, 'car', 'cars'),
  word(/\briders?\b/gi, 'driver', 'drivers'),
  word(/\bbajaji\b/gi, 'dereva'),
  word(/\bmotosikeli\b|\bpikipiki\b/gi, 'gari'),
];
const BUSINESS_RULES = [[/Smart Boda/g, () => 'Smart Bizna']];
const CHAMA_RULES = [
  [/Smart Boda/g, () => 'Smart Chama'],
  [/\u{1F3CD}\uFE0F?/gu, () => '\u{1F91D}'],
  word(/\briders?\b/gi, 'member', 'members'),
];

/** The text as this kind of user should read it. A non-string, and every rider's text, comes back untouched. */
export function convert(text, audience) {
  if (typeof text !== 'string' || !text || audience === RIDER) return text;
  const rules = audience === DRIVER ? DRIVER_RULES : audience === BUSINESS ? BUSINESS_RULES : audience === CHAMA ? CHAMA_RULES : [];
  return rules.reduce((t, [re, fn]) => t.replace(re, fn), text);
}

/** Exact wording for the strings where the plain replacement would not read naturally. Keyed by text key, per language. */
export const OVERRIDES = {
  driver: {
    en: { 'home.tile_fuel_motorcycle': 'Fuel Car', 'home.tile_service_motorcycle': 'Service Car', serviceMotorcycle: 'Service Car' },
    sw: {},
  },
  business: { en: {}, sw: {} },
  chama: { en: {}, sw: {} },
};

/** What a translation key shows: the exact wording when there is one, else the converted text. `text` is the value after the variables were filled in. */
export function textFor(key, text, audience, lang = 'en') {
  const exact = OVERRIDES[audience] && OVERRIDES[audience][lang] && OVERRIDES[audience][lang][key];
  return exact || convert(text, audience);
}

export const BRAND = { [RIDER]: 'Smart Boda', [DRIVER]: 'Smart Cabz', [BUSINESS]: 'Smart Bizna', [CHAMA]: 'Smart Chama' };
export const ICON = { [RIDER]: '\u{1F3CD}\uFE0F', [DRIVER]: '\u{1F697}', [BUSINESS]: '\u{1F3EA}', [CHAMA]: '\u{1F91D}' };
export const brandOf = (audience) => BRAND[audience] || BRAND[RIDER];
export const iconOf = (audience) => ICON[audience] || ICON[RIDER];
