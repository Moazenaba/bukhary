import type { Committee, ScheduleTask } from '../types';

/** A phone as WhatsApp wants it (country code, digits only); Egyptian mobiles 01x → 201x. Null if unusable. */
export function waNumber(phone?: string | null): string | null {
  const digits = (phone ?? '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (/^01\d{9}$/.test(digits)) return `2${digits}`;
  if (/^\+?20(1\d{9})$/.test(digits)) return `20${digits.replace(/^\+?20/, '')}`;
  if (/^00\d{8,15}$/.test(digits)) return digits.slice(2);
  if (/^\+\d{8,15}$/.test(digits)) return digits.slice(1);
  return /^\d{10,15}$/.test(digits) ? digits : null;
}

/** Opens a WhatsApp chat with the message typed in; the person presses send. */
export function waLink(phone: string | null | undefined, text: string): string | null {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

/** The ceremony invitation text: committee, sheikh, day, time and place. */
export function ceremonyInvitation(c: Committee, task?: ScheduleTask, guestName?: string): string {
  const d = c.ceremonyDetails;
  const date = (task?.date || d?.ceremonyDate || '').slice(0, 10);
  const time = task?.time || d?.ceremonyTime || '';
  const place = d?.ceremonyPlace || '';
  const day = date ? new Date(`${date}T12:00:00`).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' }) : 'سيُحدد لاحقاً';
  return [
    `السلام عليكم${guestName ? ` ${guestName}` : ''}،`,
    `ندعوكم لحضور حفل تكريم طلاب لجنة ${c.committeeNumber} (${c.committeeName})${c.sheikhName ? ` — الشيخ ${c.sheikhName}` : ''}.`,
    `📅 ${day}${time ? ` — ${time}` : ''}`,
    place ? `📍 ${place}` : '',
    'مسابقات مسجد الإمام البخاري',
  ].filter(Boolean).join('\n');
}
