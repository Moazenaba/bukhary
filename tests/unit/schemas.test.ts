import { describe, expect, it } from 'vitest';
import { dateOnly, normalizePhone, toAsciiDigits } from '../../server/schemas.ts';
import { passwordSchema, phoneSchema } from '../../server/routes/users.ts';

describe('phones: one stored form per number', () => {
  it.each([
    ['01012345678', '01012345678'],
    ['+201012345678', '01012345678'],
    ['00201012345678', '01012345678'],
    ['٠١٠١٢٣٤٥٦٧٨', '01012345678'],
    ['۰۱۰۱۲۳۴۵۶۷۸', '01012345678'],
    ['010 1234-5678', '01012345678'],
    ['+966501234567', '+966501234567'],
  ])('%s → %s', (input, out) => {
    expect(normalizePhone(input)).toBe(out);
    expect(phoneSchema.parse(input)).toBe(out);
  });

  it('rejects text that is not a phone', () => {
    expect(phoneSchema.safeParse('abc').success).toBe(false);
    expect(phoneSchema.safeParse('12').success).toBe(false);
  });

  it('Arabic-Indic digits become ASCII', () => {
    expect(toAsciiDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
  });
});

describe('dates and passwords', () => {
  it('dates are YYYY-MM-DD or empty; impossible dates are refused', () => {
    expect(dateOnly.parse('2026-02-10')).toBe('2026-02-10');
    expect(dateOnly.parse('')).toBeNull();
    expect(dateOnly.parse(undefined)).toBeNull();
    expect(dateOnly.safeParse('2026-02-31').success).toBe(false);
    expect(dateOnly.safeParse('10/02/2026').success).toBe(false);
  });

  it('passwords need 8+ characters with letters and digits (Arabic letters count)', () => {
    expect(passwordSchema.safeParse('abcdefg1').success).toBe(true);
    expect(passwordSchema.safeParse('كلمةسر12').success).toBe(true);
    expect(passwordSchema.safeParse('12345678').success).toBe(false);
    expect(passwordSchema.safeParse('abcdefgh').success).toBe(false);
    expect(passwordSchema.safeParse('a1').success).toBe(false);
  });
});
