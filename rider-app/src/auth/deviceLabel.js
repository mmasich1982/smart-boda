// rider-app/src/auth/deviceLabel.js
// SMART APPS: a short, readable name for this phone, shown on ANOTHER phone when it asks "log in here and log out there?". No personal data.
import { Platform } from 'react-native';

export function deviceLabel() {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      const ua = navigator.userAgent || '';
      const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iOS/i.test(ua) ? 'iPhone' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : 'Web';
      const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'browser';
      return `${os} · ${br}`.slice(0, 120);
    }
    return `${Platform.OS === 'ios' ? 'iPhone' : 'Android'} phone`;
  } catch { return 'a device'; }
}
export default { deviceLabel };
