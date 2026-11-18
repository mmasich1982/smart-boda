// rider-app/src/offline/netInfoConfig.js
// Silences the browser console errors "HEAD https://<app>/ net::ERR_INTERNET_DISCONNECTED" while the phone is offline.
// On the web NetInfo decides "is the internet reachable?" by sending HEAD / and, when that fails, sends it again every 5 seconds. The browser prints every
// failed request itself, so JavaScript cannot hide it: the cure is not to send it while the browser already says it is offline (navigator.onLine === false).
// With reachabilityShouldRun returning false, NetInfo reports "not reachable" at once and sends nothing (checked in @react-native-community/netinfo
// src/internal/internetReachability.ts); when the browser fires 'online' it checks again. While it says online but the check fails, it asks every 15 seconds
// instead of 5. The phone builds (native reachability) are not changed.
import NetInfo from '@react-native-community/netinfo';

const browserSaysOffline = () => typeof navigator !== 'undefined' && navigator && navigator.onLine === false;

export function configureNetInfo() {
  try {
    NetInfo.configure({
      reachabilityShouldRun: () => !browserSaysOffline(),
      reachabilityShortTimeout: 15 * 1000,
    });
  } catch { /* an older NetInfo without these options: leave the defaults */ }
}

configureNetInfo();
export default configureNetInfo;
