import { describe, expect, it } from 'vitest';
import { redact } from '../server/requestLog.ts';

// The request log prints what was sent, but never passwords, tokens or file contents.

describe('request log', () => {
  it('hides secrets and shortens bulky values', () => {
    const out = redact({
      identifier: '01012345678',
      password: 'Passw0rd-123',
      refreshToken: 'abc',
      deviceToken: '',
      imageBase64: 'x'.repeat(5000),
      notes: 'ملاحظة فيها اسم ورقم',
      title: 't'.repeat(300),
      nested: { newPassword: 'x', list: Array.from({ length: 25 }, (_, i) => i) },
    }) as any;
    // People's details are not written to the hosting provider's logs.
    expect(out.identifier).toBe('[personal]');
    expect(out.password).toBe('[hidden]');
    expect(out.refreshToken).toBe('[hidden]');
    expect(out.deviceToken).toBe('');
    expect(out.imageBase64).toBe('[5000 chars]');
    expect(out.notes).toBe('[personal]');
    expect(out.title).toMatch(/… \[300 chars\]$/);
    expect(out.nested.newPassword).toBe('[hidden]');
    expect(out.nested.list.at(-1)).toBe('… 5 more');
    expect(JSON.stringify(out)).not.toContain('Passw0rd');
  });
});
