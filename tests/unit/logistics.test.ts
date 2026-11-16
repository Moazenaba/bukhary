import { describe, expect, it } from 'vitest';
import { headOf, mapsUrl } from '../../src/utils/logistics';

describe('logistics', () => {
  it('finds the committee head, never a sheikh', () => {
    const staff = [
      { id: 's', name: 'شيخ', role: 'sheikh', phone: '0100' },
      { id: 'h', name: 'رئيس', role: 'committee_head', phone: '0111' },
    ];
    expect(headOf({ staff } as never)?.id).toBe('h');
    expect(headOf({ staff: [staff[0]] } as never)).toBeUndefined();
    expect(headOf({} as never)).toBeUndefined();
  });

  it('builds an encoded Maps search link and refuses an empty name', () => {
    const url = mapsUrl(' مسجد النور ')!;
    expect(url.startsWith('https://www.google.com/maps/search/?api=1&query=')).toBe(true);
    expect(url).not.toContain(' ');
    expect(mapsUrl('  ')).toBeNull();
    expect(mapsUrl(undefined)).toBeNull();
  });
});
