// admin-console/src/utils/gps.js
// BUSINESS GPS LOCATION: the small rules used when the Administrator registers a business. Pure, so they are tested without a browser.
// (The Admin App carries the same rules in rider-app/src/admin/gpsLocation.js; keep the two in step.)

// null, undefined and '' are NOT zero (Number(null) is 0, which would turn "no position" into the middle of the Atlantic)
const num = (v) => (v == null || (typeof v === 'string' && v.trim() === '') ? NaN : Number(v));

/** A position the server will accept: finite, inside the world, and not 0,0 (what a phone reports when it has no fix). */
export function validPosition(lat, lng) {
  const a = num(lat); const o = num(lng);
  return Number.isFinite(a) && Number.isFinite(o) && a >= -90 && a <= 90 && o >= -180 && o <= 180 && !(a === 0 && o === 0);
}

/** Roughly Kenya. Only used to WARN (a swapped latitude/longitude, or a desktop on a VPN, lands outside it); the server does not enforce it. */
export const inKenya = (lat, lng) => validPosition(lat, lng) && Number(lat) >= -4.9 && Number(lat) <= 5.2 && Number(lng) >= 33.8 && Number(lng) <= 42.0;

export const round6 = (v) => Math.round(Number(v) * 1e6) / 1e6;
export const formatCoords = (lat, lng) => `${round6(lat).toFixed(6)}, ${round6(lng).toFixed(6)}`;
export const mapsUrl = (lat, lng) => `https://www.google.com/maps?q=${round6(lat)},${round6(lng)}`;

/**
 * Read a position out of what the Administrator pastes: "-1.2864, 36.8172", "-1.2864 36.8172", or a Google Maps link
 * (…/@-1.2864,36.8172,17z, …?q=-1.2864,36.8172, …!3d-1.2864!4d36.8172). Returns { latitude, longitude } or null.
 */
export function parseCoordinates(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const tries = [/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, /[?&](?:q|ll|query|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i,
    /^\(?\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*\)?$/];
  for (const re of tries) {
    const m = t.match(re);
    if (m && validPosition(m[1], m[2])) return { latitude: round6(m[1]), longitude: round6(m[2]) };
  }
  return null;
}

/** How good a fix is, in words for the Administrator. */
export function accuracyInfo(m) {
  if (m == null || !Number.isFinite(Number(m))) return { level: 'unknown', text: 'Typed position (no accuracy)' };
  const v = Math.round(Number(m));
  if (v <= 20) return { level: 'good', text: `Good: within about ${v} m` };
  if (v <= 100) return { level: 'fair', text: `Fair: within about ${v} m. Step outside or near a window and capture again for a better fix.` };
  return { level: 'poor', text: `Weak: only within about ${v} m. This may be where the phone connected, not the shop. Capture again outdoors, or type the position.` };
}

/** Plain words for a browser / device location error. code: 1 = refused, 2 = unavailable, 3 = timed out (the Geolocation API's codes). */
export function geoErrorText(code) {
  if (code === 1) return 'Location is switched off for this page. Allow location in the browser or phone settings, then tap Capture again, or type the position below.';
  if (code === 2) return 'The device could not work out its position. Move to an open area and tap Capture again, or type the position below.';
  if (code === 3) return 'Finding the position took too long. Tap Capture again, or type the position below.';
  if (code === 'UNSUPPORTED') return 'This device cannot give its position. Type the position below.';
  return 'The location could not be captured. Tap Capture again, or type the position below.';
}

/** The browser's geolocation as an adapter: watch(onFix, onError) -> stop(). */
export function browserGeo(geo = typeof navigator !== 'undefined' ? navigator.geolocation : null) {
  if (!geo) return null;
  return {
    watch(onFix, onError) {
      const id = geo.watchPosition(onFix, onError, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
      return () => geo.clearWatch(id);
    },
  };
}

/**
 * The BEST position in a short time, in one tap: listen to the device, finish as soon as a fix is within `goodM` metres, otherwise at `maxMs` with the
 * most accurate fix seen. Refused permission stops at once. Resolves { latitude, longitude, accuracy }, rejects { code, message }.
 */
export function captureBest(adapter, { goodM = 20, maxMs = 15000, setT = setTimeout, clearT = clearTimeout } = {}) {
  return new Promise((resolve, reject) => {
    if (!adapter) { reject({ code: 'UNSUPPORTED', message: geoErrorText('UNSUPPORTED') }); return; }
    let best = null; let lastErr = null; let done = false; let stop = null; let timer = null;
    const finish = (fn, v) => { if (done) return; done = true; if (timer) clearT(timer); try { if (stop) stop(); } catch (e) { /* already stopped */ } fn(v); };
    const result = (p) => ({ latitude: round6(p.coords.latitude), longitude: round6(p.coords.longitude), accuracy: Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy * 10) / 10 : null });
    timer = setT(() => (best ? finish(resolve, result(best)) : finish(reject, { code: lastErr ? lastErr.code : 3, message: geoErrorText(lastErr ? lastErr.code : 3) })), maxMs);
    try {
      stop = adapter.watch((p) => {
        if (!p || !p.coords || !validPosition(p.coords.latitude, p.coords.longitude)) return;      // 0,0 and rubbish are not a fix
        if (!best || (p.coords.accuracy ?? Infinity) < (best.coords.accuracy ?? Infinity)) best = p;
        if ((p.coords.accuracy ?? Infinity) <= goodM) finish(resolve, result(p));
      }, (e) => {
        lastErr = e || { code: 2 };
        if (lastErr.code === 1) finish(reject, { code: 1, message: geoErrorText(1) });
      });
      if (done && stop) stop();
    } catch (e) { finish(reject, { code: 2, message: geoErrorText(2) }); }
  });
}
