// rider-app/src/components/__tests__/DueAlertBanner.test.js
import { alertTier } from '../DueAlertBanner';

test('escalates through all four tiers at the right thresholds', () => {
  expect(alertTier(600)).toBeNull();      // BR-SB12-008: above 500 km, no banner yet
  expect(alertTier(500)).toBe('first');
  expect(alertTier(200)).toBe('firm');
  expect(alertTier(100)).toBe('final');
  expect(alertTier(-5)).toBe('overdue');
});
