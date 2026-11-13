import { describe, expect, it } from 'vitest';
import type { Committee } from '../../src/types';
import { ceremonyInvitation, waLink, waNumber } from '../../src/utils/whatsapp';

describe('WhatsApp links', () => {
  it.each([
    ['01012345678', '201012345678'],
    ['٠١٠١٢٣٤٥٦٧٨', '201012345678'],
    ['010 1234 5678', '201012345678'],
    ['+201012345678', '201012345678'],
    ['00966501234567', '966501234567'],
    ['+966501234567', '966501234567'],
    ['', null],
    ['123', null],
  ])('%s → %s', (input, out) => expect(waNumber(input)).toBe(out));

  it('the link opens a chat with the message, encoded', () => {
    const href = waLink('01012345678', 'السلام عليكم\nحفل')!;
    expect(href.startsWith('https://wa.me/201012345678?text=')).toBe(true);
    expect(decodeURIComponent(href.split('text=')[1])).toBe('السلام عليكم\nحفل');
    expect(waLink('', 'x')).toBeNull();
  });

  it('the invitation names the committee, sheikh, day, time and place; the calendar task date wins', () => {
    const c = {
      id: 'c1', committeeNumber: 7, committeeName: 'لجنة النور', sheikhName: 'هشام', stages: {},
      ceremonyDetails: { ceremonyDate: '2026-11-01', ceremonyTime: '8 م', ceremonyPlace: 'القاعة الكبرى' },
    } as unknown as Committee;
    const text = ceremonyInvitation(c, { id: 't', date: '2026-11-20', time: '9 م' } as any, 'الشيخ أحمد');
    expect(text).toContain('السلام عليكم الشيخ أحمد');
    expect(text).toContain('لجنة 7 (لجنة النور) — الشيخ هشام');
    expect(text).toContain('9 م');
    expect(text).toContain('📍 القاعة الكبرى');
    expect(text).toMatch(/٢٠|20/); // the task's day, not the stored one
  });
});
