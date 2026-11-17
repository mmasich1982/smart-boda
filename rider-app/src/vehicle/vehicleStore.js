// rider-app/src/vehicle/vehicleStore.js
// SMART CABZ: which words this phone shows right now (rider / driver / business), kept in one small store so any screen can read it and
// re-draw when it changes (a login on a new phone, a Super Admin changing the vehicle type, Setup My Profile finding a driver's number).
import { useSyncExternalStore } from 'react';
import { audienceFor, convert, brandOf, iconOf, RIDER } from './vehicleWords';

let current = RIDER;
const listeners = new Set();
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export const getAudience = () => current;
export function setAudience(a) {
  if (a && a !== current) { current = a; listeners.forEach((fn) => { try { fn(); } catch { /* a listener must never break another */ } }); }
}
/** Set the words from a saved status (or a login / lookup answer shaped like one). */
export const setAudienceFromStatus = (status) => setAudience(audienceFor(status));

/** React hook: the current audience; the screen re-draws when it changes. */
export const useAudience = () => useSyncExternalStore(subscribe, getAudience, getAudience);

/** Convert a string for the person using this phone (for text written inside screens and helpers). */
export const vt = (text) => convert(text, current);
export const brandName = () => brandOf(current);
export const brandIcon = () => iconOf(current);

/** Read the saved status once (app start) and set the words. Never throws. */
export async function loadAudience() {
  try {
    const { getLocalRiderStatus } = require('../offline/db');
    setAudienceFromStatus(await getLocalRiderStatus());
  } catch { /* leave the words as they are */ }
}
