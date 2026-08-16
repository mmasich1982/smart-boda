// rider-app/src/services/__tests__/documentStatusService.test.js
import { documentStatus } from '../documentStatus'; // FIX: file is documentStatus.js, not documentStatusService.js

test('moves through every status tier as expiry approaches', () => {
  const today = new Date('2026-07-01');
  expect(documentStatus('2026-10-01', today)).toBe('valid');
  expect(documentStatus('2026-08-20', today)).toBe('expiring_2mo');
  expect(documentStatus('2026-07-25', today)).toBe('expiring_1mo');
  expect(documentStatus('2026-07-01', today)).toBe('due');
  expect(documentStatus('2026-06-01', today)).toBe('expired');  // BR-SB18-005
});
