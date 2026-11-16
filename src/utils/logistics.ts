import type { Committee } from '../types';

/** The committee head assigned to this committee («رئيس المكان»), or undefined when none is assigned. */
export function headOf(c: Pick<Committee, 'staff'>) {
  return (c.staff ?? []).find((s) => s.role === 'committee_head');
}

/** A Google Maps search link by place name. Null when the name is empty. */
export function mapsUrl(place?: string | null): string | null {
  const q = (place ?? '').trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
