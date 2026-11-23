import { api } from './api';

// The committee flow (docs/PLAN_ROLES_AND_FLOW.md): lifecycle steps, the people on a committee, the driver, the
// ceremony, availability, messages to an audience and acting as another user. The server decides everything.

export type Lifecycle = 'draft' | 'sent_to_manager' | 'observers_open' | 'active' | 'observed' | 'accredited' | 'ceremony_done';
export type StaffRole = 'owner' | 'observer' | 'ceremony_sheikh';

export const LIFECYCLE: { key: Lifecycle; label: string; by: 'admin' | 'manager' | null }[] = [
  { key: 'draft', label: 'إنشاء', by: null },
  { key: 'sent_to_manager', label: 'إرسال للمدير', by: 'admin' },
  { key: 'observers_open', label: 'السماح بالمراقبين', by: 'admin' },
  { key: 'active', label: 'تفعيل', by: 'manager' },
  { key: 'observed', label: 'تمت المراقبة', by: 'manager' },
  { key: 'accredited', label: 'الاعتماد', by: 'admin' },
  { key: 'ceremony_done', label: 'تمت الحفلة', by: 'manager' },
];
export const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  draft: 'إنشاء (غير مفعّلة)',
  sent_to_manager: 'أُرسلت للمدير',
  observers_open: 'مسموح بالمراقبين',
  active: 'مفعّلة',
  observed: 'تمت المراقبة / جاري التصحيح',
  accredited: 'معتمدة',
  ceremony_done: 'تمت الحفلة',
};
export const STAFF_LABEL: Record<StaffRole, string> = { owner: 'شيخ اللجنة', observer: 'مراقب', ceremony_sheikh: 'شيخ الحفلة' };
export const lifecycleIndex = (l?: string) => Math.max(0, LIFECYCLE.findIndex((x) => x.key === (l ?? 'active')));

export interface StaffEntry {
  id: string;
  userId: string;
  name: string;
  phone?: string;
  role: StaffRole;
  canAssign: boolean;
  note?: string;
  excuseReason?: string;
  notified: boolean;
  assignedBy: string;
}
export interface CommitteePeople {
  viewer: 'admin' | 'manager' | 'owner' | 'observer' | 'ceremony_sheikh';
  lifecycle: Lifecycle;
  lifecycleLabel: string;
  owner: { userId?: string; name: string; phone?: string } | null;
  ownerCanAssign: boolean;
  observers: StaffEntry[];
  ceremonySheikhs: StaffEntry[];
  driver: { name: string; phone: string } | null;
  mine: StaffEntry[];
  excused?: StaffEntry[];
}
export interface Person {
  id: string;
  name: string;
  role: string;
  phone?: string;
}
export interface BusyItem {
  committeeId: string;
  label: string;
  kind: 'committee' | 'ceremony';
  time?: string;
}
export interface Availability {
  date: string;
  available: Person[];
  unassigned: Person[];
  busy: (Person & { items: BusyItem[] })[];
}
export type Audience =
  | { kind: 'all' }
  | { kind: 'users'; userIds: string[] }
  | { kind: 'accountRole'; accountRole: string }
  | { kind: 'staffRole'; staffRole: StaffRole }
  | { kind: 'committee'; committeeId: string; committeeRoles?: StaffRole[] }
  | { kind: 'available'; date: string };

const c = (id: string) => `/committees/${encodeURIComponent(id)}`;

export const StaffApi = {
  people: (committeeId: string) => api<CommitteePeople & { success: true }>(`${c(committeeId)}/people`),
  step: (committeeId: string, to: Lifecycle) => api(`${c(committeeId)}/lifecycle`, { method: 'POST', body: { to } }),
  add: (committeeId: string, body: { userId: string; role: 'observer' | 'ceremony_sheikh'; note?: string; confirmConflicts?: boolean }) =>
    api(`${c(committeeId)}/staff`, { method: 'POST', body }),
  remove: (committeeId: string, staffId: string) => api(`${c(committeeId)}/staff/${encodeURIComponent(staffId)}`, { method: 'DELETE' }),
  excuse: (committeeId: string, staffId: string, reason: string) =>
    api(`${c(committeeId)}/staff/${encodeURIComponent(staffId)}/excuse`, { method: 'POST', body: { reason } }),
  setOwner: (committeeId: string, userId: string) => api(`${c(committeeId)}/owner`, { method: 'PUT', body: { userId } }),
  setCanAssign: (committeeId: string, value: boolean) => api(`${c(committeeId)}/owner/can-assign`, { method: 'PATCH', body: { value } }),
  setDriver: (committeeId: string, body: { hasDriver: boolean; name?: string; phone?: string }) =>
    api(`${c(committeeId)}/driver`, { method: 'PATCH', body }),
  saveCeremony: (
    committeeId: string,
    body: { ceremonyDate?: string; ceremonyTime?: string; ceremonyPlace?: string; honoredStudentsCount?: number | null; notes?: string }
  ) => api(`${c(committeeId)}/ceremony`, { method: 'POST', body }),
  availability: (date: string) => api<Availability & { success: true }>(`/people/availability?date=${encodeURIComponent(date)}`),
  candidates: () => api<{ users: Person[] }>('/users/ceremony-candidates').then((r) => r.users),
  send: (body: { title: string; description: string; type: 'info' | 'urgent' | 'success'; audience: Audience }) =>
    api<{ recipients: number }>('/notifications', { method: 'POST', body }),
  preview: (audience: Audience) => api<{ recipients: number; sample: { id: string; name: string }[] }>('/notifications/preview', { method: 'POST', body: { audience } }),
  sent: () =>
    api<{ sent: { batchId: string; title: string; description: string; type: string; createdAt: string; recipients: number; read: number; sentBy: string }[] }>(
      '/notifications/sent'
    ).then((r) => r.sent),
};

/** Today in Cairo (YYYY-MM-DD). */
export const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
