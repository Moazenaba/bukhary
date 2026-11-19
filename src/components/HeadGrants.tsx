import React, { useEffect, useState } from 'react';
import { CeremonyDecision, Committee, HeadGrant } from '../types';
import { AssignableUser, DataService } from '../services/DataService';
import { AuthService } from '../services/AuthService';
import { errorMessage } from '../services/api';

// «شيخ اللجنة»: an admin makes an approved sheikh the head of some committees for a date window. The
// server decides who may do what; these panels only show the grants it returns and send the admin's choices.

export const DECISION_LABEL: Record<CeremonyDecision, string> = {
  yes: 'سيكون هناك حفل',
  no: 'لن يكون هناك حفل',
  undecided: 'لم يتم التحديد بعد',
};
const ROLE_LABEL = { admin: 'الأدمن', head: 'رئيس اللجنة', holder: 'الرئيس المؤقت' } as const;

const dateText = (g: Pick<HeadGrant, 'startsOn' | 'endsOn'>) => `من ${g.startsOn} حتى ${g.endsOn}`;

/** Admins: give a temporary head role, see the grants, and end one early. */
export const HeadGrantsAdminPanel: React.FC<{ committees: Committee[] }> = ({ committees }) => {
  const [grants, setGrants] = useState<HeadGrant[] | null>(null);
  const [people, setPeople] = useState<AssignableUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = () =>
    DataService.getHeadGrants()
      .then((g) => {
        setGrants(g);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  useEffect(() => {
    void reload();
    DataService.getAssignableUsers()
      .then((u) => setPeople(u.filter((p) => p.role === 'sheikh')))
      .catch(() => setPeople([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const grant = async () => {
    setSaving(true);
    try {
      await DataService.createHeadGrant({ userId, committeeIds: picked, startsOn, endsOn });
      setPicked([]);
      setUserId('');
      setStartsOn('');
      setEndsOn('');
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  const end = async (g: HeadGrant) => {
    if (!window.confirm(`إنهاء جولة ${g.userName} كشيخ اللجنة؟ تنتهي صلاحياته فورًا.`)) return;
    try {
      await DataService.endHeadGrant(g.id);
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const canSubmit = Boolean(userId && picked.length && startsOn && endsOn && endsOn >= startsOn) && !saving;
  return (
    <section className="rounded-2xl border border-line bg-white p-4 space-y-4" aria-label="شيخ اللجنة">
      <header>
        <h3 className="font-bold text-ink">شيخ اللجنة</h3>
        <p className="text-xs text-muted">يأخذ الشيخ صلاحيات رئيس اللجنة على اللجان المختارة لفترة محددة، وتنتهي بقرار الحفل.</p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm">
          <span className="font-bold text-ink">الشيخ</span>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className="mt-1 w-full rounded-xl border border-line px-3 py-2 bg-white">
            <option value="">— اختر —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="block">
            <span className="font-bold text-ink">من</span>
            <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="mt-1 w-full rounded-xl border border-line px-2 py-2" />
          </label>
          <label className="block">
            <span className="font-bold text-ink">حتى</span>
            <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className="mt-1 w-full rounded-xl border border-line px-2 py-2" />
          </label>
        </div>
      </div>

      <fieldset>
        <legend className="font-bold text-sm text-ink mb-1">اللجان</legend>
        <div className="flex flex-wrap gap-2">
          {committees.map((c) => (
            <label key={c.id} className={`px-3 py-1.5 rounded-full border text-sm cursor-pointer ${picked.includes(c.id) ? 'bg-ink text-white border-ink' : 'border-line'}`}>
              <input type="checkbox" className="sr-only" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} />
              لجنة {c.committeeNumber}
            </label>
          ))}
        </div>
      </fieldset>

      <button type="button" disabled={!canSubmit} onClick={() => void grant()} className="px-4 py-2 rounded-xl bg-ink text-white font-bold disabled:opacity-40 cursor-pointer">
        إسناد الرئاسة المؤقتة
      </button>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}

      <ul className="divide-y divide-line">
        {(grants ?? []).map((g) => (
          <li key={g.id} className="py-2 flex flex-wrap items-center gap-2 justify-between text-sm">
            <span>
              <strong>{g.userName}</strong> — {g.committeeIds.map((id) => committees.find((c) => c.id === id)?.committeeNumber ?? id).join('، ')} — {dateText(g)}
              <span className="block text-xs text-muted">القرار: {DECISION_LABEL[g.ceremonyDecision]} · {g.status === 'active' ? 'جارية' : 'منتهية'}</span>
            </span>
            {g.status === 'active' && (
              <button type="button" onClick={() => void end(g)} className="px-2 py-1 rounded-lg border border-rose-200 text-rose-700 font-bold cursor-pointer">
                إنهاء
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

/**
 * On a committee: the ceremony decision for the active grants on it, for the temporary head, the committee's
 * permanent head and admins. The server refuses a decision from anyone else and never lets a lower one overwrite a higher.
 */
export const CeremonyDecisionCard: React.FC<{ committee: Committee }> = ({ committee }) => {
  const [grants, setGrants] = useState<HeadGrant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = () =>
    DataService.getHeadGrants()
      .then((all) => setGrants(all.filter((g) => g.status === 'active' && g.committeeIds.includes(committee.id))))
      .catch((err) => setError(errorMessage(err)));
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committee.id]);
  if (!grants || grants.length === 0) return null;

  const decide = async (g: HeadGrant, decision: CeremonyDecision) => {
    try {
      await DataService.decideHeadGrant(g.id, decision);
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-3" aria-label="القرار في الحفل">
      <h3 className="font-bold text-ink">القرار في الحفل</h3>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {grants.map((g) => (
        <div key={g.id} className="space-y-2">
          <p className="text-sm">
            <strong>{g.userName}</strong> شيخ اللجنة {dateText(g)}.
            <span className="block text-xs text-muted">
              القرار الحالي: {DECISION_LABEL[g.ceremonyDecision]}
              {g.decidedByRole ? ` (من ${ROLE_LABEL[g.decidedByRole]})` : ''}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {(['yes', 'no', 'undecided'] as CeremonyDecision[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => void decide(g, d)}
                className={`px-3 py-1.5 rounded-lg border text-sm font-bold cursor-pointer ${g.ceremonyDecision === d ? 'bg-ink text-white border-ink' : 'border-line bg-white'}`}
              >
                {DECISION_LABEL[d]}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
};

export const canSeeHeadGrants = () => AuthService.can('users.grant');
