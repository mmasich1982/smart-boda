// admin-console/src/utils/pii.test.js
import { describe, it, expect } from 'vitest';
import { maskPhone, maskEmail } from './pii';

describe('maskPhone', () => {
  it('masks the middle digits of a full phone number', () => {
    expect(maskPhone('0722123456')).toBe('0722***56');
  });
  it('returns a placeholder for empty input', () => {
    expect(maskPhone(null)).toBe('—');
    expect(maskPhone(undefined)).toBe('—');
  });
});

describe('maskEmail', () => {
  it('masks the local part of an email, keeping the domain visible', () => {
    expect(maskEmail('rider@example.com')).toBe('ri***@example.com');
  });
  it('returns the raw value if it is not really an email', () => {
    expect(maskEmail('not-an-email')).toBe('not-an-email');
  });
});
