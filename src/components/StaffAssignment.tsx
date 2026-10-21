import React, { useEffect, useMemo, useState } from 'react';
import { AppUser, Committee, UserRole } from '../types';
import { AssignableUser, DataService } from '../services/DataService';
import { AuthService } from '../services/AuthService';
import { errorMessage } from '../services/api';
import { useEscapeKey } from '../hooks/useEscapeKey';

// Who goes where: committee heads and sheikhs placed on committees, and people invited to
// ceremonies. The server decides who may place whom (admins: heads and sheikhs; committee heads:
// sheikhs, in the committees they head) and notifies everyone added or removed.

const isStaffRole = (role: string) => role === 'sheikh' || role === 'committee_head';

const committeeTitle = (c: Committee) => `لجنة ${c.committeeNumber} — ${c.committeeName}`;

/** Committee page: the committee's heads and sheikhs, with add / remove for those who may staff it. */
export const CommitteeStaffPanel: React.FC<{ committee: Committee; onChanged?: (c: Committee) => void }> = ({ committee, onChanged }) => {
  const canStaff = AuthService.canOnCommittee('committees.members', committee);
  const me = AuthService.getCurrentUser();
  const staff = committee.staff ?? [];
  const [editing, setEditing] = useState(false);
  const [people, setPeople] = useState<AssignableUser[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing || people) return;
    DataService.getCeremonyCandidates()
      .then((list) => setPeople(list.filter((p) => isStaffRole(p.role) && p.id !== me?.id)))
      .catch((err) => setError(errorMessage(err)));
  }, [editing, people, me?.id]);

  const placeable = new Set((people ?? []).map((p) => p.id));
  const startEditing = () => {
    setSelected(staff.map((s) => s.id));
    setEditing(true);
  };
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      // Only people the caller may place are sent; the server keeps everyone else as they are.
      const saved = await DataService.setCommitteeMembers(committee.id, selected.filter((id) => placeable.has(id)));
      onChanged?.(saved);
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  const shown = (people ?? []).filter((p) => !query.trim() || p.name.includes(query.trim()));

  return (
    <div className="p-4 rounded-2xl border border-line bg-white space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-sm text-ink flex items-center gap-1.5">
          <span className="material-symbols-outlined text-brand">groups</span>
          <span>شيوخ اللجنة ({staff.length})</span>
        </h3>
        {canStaff && !editing && (
          <button
            type="button"
            onClick={startEditing}
            className="px-3 py-1.5 rounded-lg bg-brand text-white font-bold cursor-pointer flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">person_add</span>
            <span>إضافة / إزالة شيوخ</span>
          </button>
        )}
      </div>

      {!editing && (
        staff.length === 0 ? (
          <p className="text-muted">لم يُضف أحد لهذه اللجنة بعد.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {staff.map((s) => (
              <li key={s.id} className={`px-2.5 py-1 rounded-full border font-semibold ${AuthService.getRoleBadgeClass(s.role)}`}>
                {s.name}
                {s.role === 'committee_head' && <span className="font-normal"> · رئيس لجنة</span>}
              </li>
            ))}
          </ul>
        )
      )}

      {editing && (
        <div className="space-y-2">
          {error && <p role="alert" className="text-rose-700">{error}</p>}
          {people === null && !error && <p className="text-muted">جارٍ تحميل قائمة الشيوخ…</p>}
          {people !== null && (
            <>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="بحث بالاسم…"
                aria-label="بحث عن شيخ"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-brand"
              />
              <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                {shown.length === 0 && <p className="p-3 text-muted">لا يوجد أشخاص مطابقون</p>}
                {shown.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selected.includes(p.id)}
                      onChange={() => setSelected((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]))}
                    />
                    <span className="font-semibold text-slate-800">{p.name}</span>
                    <span className="text-slate-400">{AuthService.getRoleLabel(p.role as UserRole)}</span>
                  </label>
                ))}
              </div>
              <p className="text-muted">يصل لكل من تضيفه أو تزيله تنبيه بذلك.</p>
            </>
          )}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg border border-line font-bold cursor-pointer">
              إلغاء
            </button>
            <button
              type="button"
              disabled={saving || people === null}
              onClick={() => void save()}
              className="px-3 py-1.5 rounded-lg bg-brand text-white font-bold cursor-pointer disabled:opacity-50"
            >
              {saving ? 'جارٍ الحفظ…' : 'حفظ'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/** What a person is assigned to: the committees they sit on or head, and the ceremonies they are invited to. */
export function assignmentsOf(user: Pick<AppUser, 'id'>, committees: Committee[]) {
  return {
    committees: committees.filter((c) => c.staff?.some((s) => s.id === user.id)),
    ceremonies: committees.filter((c) => c.ceremonyDetails?.attendees?.some((a) => a.id === user.id)),
  };
}

/**
 * A person's page: place them on committees and invite them to ceremonies in one place.
 * Each change goes to the committee it concerns, so the person gets one notice per change.
 */
export const PersonAssignmentsModal: React.FC<{
  user: AppUser;
  committees: Committee[];
  onClose: () => void;
  onChanged: (c: Committee) => void;
}> = ({ user, committees, onClose, onChanged }) => {
  useEscapeKey(onClose);
  const current = useMemo(() => assignmentsOf(user, committees), [user, committees]);
  const [memberOf, setMemberOf] = useState<string[]>(current.committees.map((c) => c.id));
  const [invitedTo, setInvitedTo] = useState<string[]>(current.ceremonies.map((c) => c.id));
  const [tab, setTab] = useState<'committees' | 'ceremonies'>('committees');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Admins place committee heads and sheikhs; committee heads place sheikhs only.
  const canPlaceThisPerson = user.role === 'sheikh' || AuthService.can('users.grant');
  const staffable = committees.filter((c) => canPlaceThisPerson && AuthService.canOnCommittee('committees.members', c));
  const withCeremony = committees.filter((c) => AuthService.canOnCommittee('committees.finalize', c) && (c.ceremonyDetails?.ceremonyDate || current.ceremonies.some((x) => x.id === c.id)));
  const match = (c: Committee) => !query.trim() || committeeTitle(c).includes(query.trim()) || (c.courseName ?? '').includes(query.trim());

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      for (const c of staffable) {
        const was = current.committees.some((x) => x.id === c.id);
        const now = memberOf.includes(c.id);
        if (was === now) continue;
        const others = (c.staff ?? []).map((s) => s.id).filter((id) => id !== user.id);
        onChanged(await DataService.setCommitteeMembers(c.id, now ? [...others, user.id] : others));
      }
      for (const c of withCeremony) {
        const was = current.ceremonies.some((x) => x.id === c.id);
        const now = invitedTo.includes(c.id);
        if (was === now) continue;
        onChanged(await DataService.setCeremonyAttendees(c.id, now ? { add: [user.id] } : { remove: [user.id] }));
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const list = tab === 'committees' ? staffable.filter(match) : withCeremony.filter(match);
  const chosen = tab === 'committees' ? memberOf : invitedTo;
  const setChosen = tab === 'committees' ? setMemberOf : setInvitedTo;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`لجان وحفلات ${user.name}`}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl text-xs">
        <div className="p-4 border-b border-line flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-ink">لجان وحفلات: {user.name}</h3>
            <span className="text-muted">{AuthService.getRoleLabel(user.role)}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          <div className="flex gap-1.5" role="tablist">
            {(['committees', 'ceremonies'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${tab === k ? 'bg-brand text-white' : 'bg-slate-100 text-ink'}`}
              >
                {k === 'committees' ? `اللجان (${memberOf.length})` : `الحفلات (${invitedTo.length})`}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث برقم اللجنة أو اسمها…"
            aria-label="بحث عن لجنة"
            className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:border-brand"
          />
          {error && <p role="alert" className="text-rose-700">{error}</p>}
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
            {list.length === 0 && (
              <p className="p-3 text-muted">
                {tab === 'committees' ? 'لا توجد لجان يمكنك إضافته إليها' : 'لا توجد حفلات محددة الموعد يمكنك دعوته إليها'}
              </p>
            )}
            {list.map((c) => (
              <label key={c.id} className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={chosen.includes(c.id)}
                  onChange={() => setChosen((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))}
                />
                <span>
                  <span className="font-semibold text-slate-800 block">{committeeTitle(c)}</span>
                  <span className="text-muted">
                    {tab === 'ceremonies'
                      ? [c.ceremonyDetails?.ceremonyDate, c.ceremonyDetails?.ceremonyTime, c.ceremonyDetails?.ceremonyPlace].filter(Boolean).join(' — ') || 'لم يحدد الموعد'
                      : c.courseName ?? ''}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p className="text-muted">يصله تنبيه عند إضافته أو إزالته، ويرى في حسابه اللجان والحفلات المسندة إليه فقط.</p>
        </div>

        <div className="p-4 border-t border-line flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-line font-bold cursor-pointer">
            إلغاء
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="px-3 py-1.5 rounded-lg bg-brand text-white font-bold cursor-pointer disabled:opacity-50"
          >
            {saving ? 'جارٍ الحفظ…' : 'حفظ'}
          </button>
        </div>
      </div>
    </div>
  );
};
