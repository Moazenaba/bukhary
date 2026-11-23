import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Committee } from '../types';
import { AuthService } from '../services/AuthService';
import { ApiError, api, errorMessage } from '../services/api';
import {
  type BusyItem,
  type CommitteePeople,
  LIFECYCLE,
  type Lifecycle,
  type Person,
  STAFF_LABEL,
  type StaffEntry,
  StaffApi,
  lifecycleIndex,
  today,
} from '../services/staffApi';

// The committee's flow (docs/PLAN_ROLES_AND_FLOW.md), on its page: the lifecycle with the next step, the owner
// («شيخ اللجنة»), the right to assign, the driver, the observers, the ceremony and its sheikhs, and the person's own
// jobs with «اعتذار». Every button is shown only when the server would accept it.

const box = 'p-4 rounded-2xl border border-line bg-white space-y-3 text-xs';
const btn = 'px-3 py-1.5 rounded-lg font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
const input = 'w-full px-2.5 py-1.5 rounded-lg border border-line bg-white text-xs';

const LifecycleBar: React.FC<{ current: Lifecycle }> = ({ current }) => {
  const at = lifecycleIndex(current);
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label="مراحل اللجنة">
      {LIFECYCLE.map((s, i) => (
        <li
          key={s.key}
          aria-current={i === at ? 'step' : undefined}
          className={`px-2 py-1 rounded-full border text-[11px] font-bold ${
            i < at ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : i === at ? 'bg-brand text-white border-brand' : 'bg-slate-50 border-line text-muted'
          }`}
        >
          {i < at ? '✓ ' : ''}
          {s.label}
        </li>
      ))}
    </ol>
  );
};

/** The confirmation shown when the server warns that the person is busy the same day. */
const ConflictDialog: React.FC<{
  conflicts: (BusyItem & { day?: string; userName?: string })[];
  onConfirm: (note: string) => void;
  onCancel: () => void;
}> = ({ conflicts, onConfirm, onCancel }) => {
  const [note, setNote] = useState('');
  return (
    <div role="dialog" aria-modal="true" aria-label="تعارض في المواعيد" className="p-3 rounded-xl border border-amber-300 bg-amber-50 space-y-2">
      <p className="font-bold text-amber-900">
        تنبيه: {conflicts[0]?.userName ?? 'هذا الشخص'} لديه مهمة أخرى يوم {conflicts[0]?.day}:
      </p>
      <ul className="list-disc pr-5 text-amber-900">
        {conflicts.map((c, i) => (
          <li key={i}>
            {c.label}
            {c.time ? ` (${c.time})` : ''}
          </li>
        ))}
      </ul>
      <label className="block space-y-1">
        <span className="font-semibold text-ink">ملاحظة تُرسل له مع التكليف (اختياري)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={input} placeholder="مثال: لجنتك هنا الساعة 4 عصرًا" />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => onConfirm(note)} className={`${btn} bg-amber-600 text-white`}>
          تأكيد التعيين رغم التعارض
        </button>
        <button type="button" onClick={onCancel} className={`${btn} border border-line bg-white`}>
          إلغاء
        </button>
      </div>
    </div>
  );
};

/** Pick a person to add, with who is busy on the job's day. */
const AddPerson: React.FC<{
  committee: Committee;
  role: 'observer' | 'ceremony_sheikh';
  day?: string | null;
  exclude: Set<string>;
  onAdded: () => void;
}> = ({ committee, role, day, exclude, onAdded }) => {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<(Person & { busy?: BusyItem[] })[] | null>(null);
  const [userId, setUserId] = useState('');
  const [note, setNote] = useState('');
  const [conflicts, setConflicts] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || people) return;
    const load = AuthService.can('people.availability')
      ? StaffApi.availability(day || today()).then((a) => [
          ...a.available,
          ...a.busy.map((b) => ({ ...b, busy: b.items })),
        ])
      : StaffApi.candidates();
    load
      .then((list) => setPeople(list.filter((p) => p.role === 'sheikh' || p.role === 'committee_head').sort((a, b) => a.name.localeCompare(b.name, 'ar'))))
      .catch((err) => setError(errorMessage(err)));
  }, [open, people, day]);

  const submit = async (confirmConflicts = false, confirmNote?: string) => {
    if (!userId) return setError('اختر الشخص أولًا');
    setSaving(true);
    setError(null);
    try {
      await StaffApi.add(committee.id, { userId, role, note: (confirmNote ?? note) || undefined, confirmConflicts });
      setUserId('');
      setNote('');
      setConflicts(null);
      setOpen(false);
      onAdded();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'schedule_conflict') setConflicts(err.details?.conflicts ?? []);
      else setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${btn} bg-brand text-white`}>
        {role === 'observer' ? 'إضافة مراقب' : 'تعيين شيخ للحفلة'}
      </button>
    );
  }
  const options = (people ?? []).filter((p) => !exclude.has(p.id));
  return (
    <div className="p-3 rounded-xl border border-line bg-slate-50 space-y-2">
      {error && <p role="alert" className="text-rose-700 font-semibold">{error}</p>}
      {people === null && !error && <p className="text-muted">جارٍ تحميل الأشخاص…</p>}
      {people && (
        <label className="block space-y-1">
          <span className="font-semibold">{role === 'observer' ? 'المراقب' : 'شيخ الحفلة'}</span>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className={input} aria-label="اختر الشخص">
            <option value="">— اختر —</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.busy?.length ? ` (مشغول: ${p.busy.map((b) => b.label).join('، ')})` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block space-y-1">
        <span className="font-semibold">ملاحظة له (اختياري)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} className={input} />
      </label>
      {conflicts ? (
        <ConflictDialog conflicts={conflicts} onConfirm={(n) => void submit(true, n || note)} onCancel={() => setConflicts(null)} />
      ) : (
        <div className="flex gap-2">
          <button type="button" disabled={saving} onClick={() => void submit(false)} className={`${btn} bg-brand text-white`}>
            {saving ? 'جارٍ الحفظ…' : 'تعيين'}
          </button>
          <button type="button" onClick={() => setOpen(false)} className={`${btn} border border-line bg-white`}>
            إلغاء
          </button>
        </div>
      )}
    </div>
  );
};

const PersonRow: React.FC<{ s: StaffEntry; canRemove: boolean; onRemove: () => void }> = ({ s, canRemove, onRemove }) => (
  <li className="flex items-center justify-between gap-2 py-1.5 border-b border-line last:border-0">
    <span>
      <span className="font-bold text-ink">{s.name}</span>
      {s.phone && (
        <a href={`tel:${s.phone}`} className="text-brand mr-2" dir="ltr">
          {s.phone}
        </a>
      )}
      {!s.notified && <span className="mr-2 px-1.5 py-0.5 rounded bg-slate-100 text-muted">لم يُبلّغ بعد</span>}
      {s.note && <span className="block text-muted">ملاحظة: {s.note}</span>}
      {s.excuseReason && <span className="block text-rose-700">اعتذر: {s.excuseReason}</span>}
    </span>
    {canRemove && (
      <button type="button" onClick={onRemove} className={`${btn} border border-rose-200 text-rose-700`}>
        إزالة
      </button>
    )}
  </li>
);

export const CommitteeFlowPanel: React.FC<{ committee: Committee; onChanged?: (committee: Committee) => void }> = ({ committee, onChanged }) => {
  const [data, setData] = useState<CommitteePeople | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => {
    StaffApi.people(committee.id)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [committee.id]);
  useEffect(reload, [reload]);
  const changed = () => {
    reload();
    // The committee itself changed too (its step, driver or ceremony): the page shows the server's copy.
    if (onChanged) {
      api<{ committee: Committee }>(`/committees/${encodeURIComponent(committee.id)}`)
        .then((r) => onChanged(r.committee))
        .catch(() => {});
    }
  };
  const run = async (fn: () => Promise<unknown>, confirm?: string) => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    try {
      await fn();
      changed();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const lifecycle = (data?.lifecycle ?? committee.lifecycle ?? 'active') as Lifecycle;
  const at = lifecycleIndex(lifecycle);
  const next = LIFECYCLE[at + 1];
  const isAdmin = AuthService.can('lifecycle.admin');
  const canStep = next && (next.by === 'admin' ? isAdmin : AuthService.can('lifecycle.manager'));
  const full = data?.viewer === 'admin' || data?.viewer === 'manager';
  const canStaff = full || (data?.viewer === 'owner' && data.ownerCanAssign);
  const observersOpen = isAdmin || at >= lifecycleIndex('observers_open');
  const ceremonyOpen = isAdmin || at >= lifecycleIndex('accredited');
  const onCommittee = useMemo(
    () => new Set([...(data?.observers ?? []), ...(data?.ceremonySheikhs ?? [])].map((s) => s.userId)),
    [data]
  );

  if (error && !data) return <p role="alert" className="text-rose-700 font-semibold text-xs">{error}</p>;
  if (!data) return <p className="text-muted text-xs">جارٍ تحميل بيانات اللجنة…</p>;

  return (
    <div className="space-y-3" data-testid="committee-flow">
      <section className={box} aria-label="مرحلة اللجنة">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-bold text-sm text-ink flex items-center gap-1.5">
            <span className="material-symbols-outlined text-brand">route</span>
            <span>مرحلة اللجنة: {data.lifecycleLabel}</span>
          </h3>
          <div className="flex gap-2">
            {isAdmin && at > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => StaffApi.step(committee.id, LIFECYCLE[at - 1].key), `الرجوع لمرحلة «${LIFECYCLE[at - 1].label}»؟`)}
                className={`${btn} border border-line bg-white`}
              >
                رجوع خطوة
              </button>
            )}
            {canStep && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => StaffApi.step(committee.id, next.key), `تأكيد: «${next.label}»؟`)}
                className={`${btn} bg-brand text-white`}
              >
                {next.label}
              </button>
            )}
          </div>
        </div>
        <LifecycleBar current={lifecycle} />
        {lifecycle === 'draft' && <p className="text-muted">اللجنة غير مفعّلة: لا يراها أحد غير الإدارة، ولن تصل التنبيهات للأعضاء قبل التفعيل.</p>}
        {at > 0 && at < lifecycleIndex('active') && (
          <p className="text-muted">تنبيهات الأعضاء محبوسة حتى يفعّل مدير الحفلات والامتحانات اللجنة.</p>
        )}
        {error && <p role="alert" className="text-rose-700 font-semibold">{error}</p>}
      </section>

      {data.mine.length > 0 && (
        <section className={`${box} border-brand/40`} aria-label="تكليفي">
          <h3 className="font-bold text-sm text-ink">تكليفك في هذه اللجنة</h3>
          {data.mine.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2">
              <span>
                <span className="font-bold">{STAFF_LABEL[m.role]}</span>
                {m.note && <span className="block text-muted">ملاحظة: {m.note}</span>}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const reason = window.prompt('سبب الاعتذار (يصل لمدير الحفلات وشيخ اللجنة):');
                  if (reason === null) return;
                  void run(() => StaffApi.excuse(committee.id, m.id, reason));
                }}
                className={`${btn} border border-rose-200 text-rose-700`}
              >
                اعتذار
              </button>
            </div>
          ))}
        </section>
      )}

      <section className={box} aria-label="شيخ اللجنة والسائق">
        <h3 className="font-bold text-sm text-ink">شيخ اللجنة</h3>
        {data.owner ? (
          <p>
            <span className="font-bold">{data.owner.name}</span>
            {data.owner.phone && (
              <a href={`tel:${data.owner.phone}`} className="text-brand mr-2" dir="ltr">
                {data.owner.phone}
              </a>
            )}
          </p>
        ) : (
          <p className="text-rose-700">لم يُحدد شيخ اللجنة بعد{isAdmin ? ' (مطلوب قبل الإرسال للمدير)' : ''}.</p>
        )}
        {AuthService.can('committees.owner') && <OwnerPicker committeeId={committee.id} current={data.owner?.userId} onSaved={changed} />}
        {AuthService.can('committees.delegate') && data.owner && full && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={data.ownerCanAssign}
              disabled={busy}
              onChange={(e) => void run(() => StaffApi.setCanAssign(committee.id, e.target.checked))}
            />
            <span>السماح لشيخ اللجنة بتعيين المراقبين ومشايخ الحفلة</span>
          </label>
        )}
        <DriverBox committee={committee} driver={data.driver} editable={AuthService.can('committees.driver') && full} onSaved={changed} />
      </section>

      {data.viewer !== 'ceremony_sheikh' && (
        <section className={box} aria-label="المراقبون">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-sm text-ink">المراقبون ({data.observers.length})</h3>
            {canStaff && observersOpen && (
              <AddPerson committee={committee} role="observer" day={committee.examDate} exclude={onCommittee} onAdded={changed} />
            )}
          </div>
          {canStaff && !observersOpen && <p className="text-muted">تُضاف المراقبون بعد أن يسمح الأدمن بذلك.</p>}
          {data.observers.length === 0 ? (
            <p className="text-muted">لا يوجد مراقبون بعد.</p>
          ) : (
            <ul>
              {data.observers.map((s) => (
                <PersonRow key={s.id} s={s} canRemove={canStaff} onRemove={() => void run(() => StaffApi.remove(committee.id, s.id), `إزالة ${s.name}؟`)} />
              ))}
            </ul>
          )}
        </section>
      )}

      {data.viewer !== 'observer' && (
        <section className={box} aria-label="الحفلة">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-sm text-ink">الحفلة ومشايخها ({data.ceremonySheikhs.length})</h3>
            {canStaff && ceremonyOpen && (
              <AddPerson
                committee={committee}
                role="ceremony_sheikh"
                day={committee.ceremonyDetails?.ceremonyDate}
                exclude={onCommittee}
                onAdded={changed}
              />
            )}
          </div>
          <CeremonyBox committee={committee} editable={AuthService.can('committees.ceremony') && full} onSaved={changed} />
          {canStaff && !ceremonyOpen && <p className="text-muted">يُعيَّن مشايخ الحفلة بعد اعتماد اللجنة.</p>}
          {data.ceremonySheikhs.length > 0 && (
            <ul>
              {data.ceremonySheikhs.map((s) => (
                <PersonRow key={s.id} s={s} canRemove={canStaff} onRemove={() => void run(() => StaffApi.remove(committee.id, s.id), `إزالة ${s.name}؟`)} />
              ))}
            </ul>
          )}
        </section>
      )}

      {full && (data.excused?.length ?? 0) > 0 && (
        <section className={`${box} border-rose-200`} aria-label="الاعتذارات">
          <h3 className="font-bold text-sm text-rose-800">اعتذارات</h3>
          <ul>
            {data.excused!.map((s) => (
              <li key={s.id} className="py-1">
                <span className="font-bold">{s.name}</span> ({STAFF_LABEL[s.role]}){s.excuseReason ? ` — ${s.excuseReason}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

const OwnerPicker: React.FC<{ committeeId: string; current?: string; onSaved: () => void }> = ({ committeeId, current, onSaved }) => {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [userId, setUserId] = useState(current ?? '');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open && !people) StaffApi.candidates().then(setPeople).catch((err) => setError(errorMessage(err)));
  }, [open, people]);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${btn} border border-line bg-white`}>
        {current ? 'تغيير شيخ اللجنة' : 'تحديد شيخ اللجنة'}
      </button>
    );
  }
  return (
    <div className="flex flex-wrap gap-2 items-end">
      <select value={userId} onChange={(e) => setUserId(e.target.value)} className={`${input} max-w-xs`} aria-label="شيخ اللجنة">
        <option value="">— اختر —</option>
        {(people ?? [])
          .filter((p) => p.role === 'sheikh' || p.role === 'committee_head')
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </select>
      <button
        type="button"
        disabled={!userId}
        onClick={() =>
          StaffApi.setOwner(committeeId, userId)
            .then(() => {
              setOpen(false);
              onSaved();
            })
            .catch((err) => setError(errorMessage(err)))
        }
        className={`${btn} bg-brand text-white`}
      >
        حفظ
      </button>
      {error && <p role="alert" className="text-rose-700 w-full">{error}</p>}
    </div>
  );
};

const DriverBox: React.FC<{ committee: Committee; driver: CommitteePeople['driver']; editable: boolean; onSaved: () => void }> = ({
  committee,
  driver,
  editable,
  onSaved,
}) => {
  const [edit, setEdit] = useState(false);
  const [has, setHas] = useState(Boolean(driver));
  const [name, setName] = useState(driver?.name ?? '');
  const [phone, setPhone] = useState(driver?.phone ?? '');
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="pt-2 border-t border-line space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p>
          <span className="font-bold">السائق: </span>
          {driver ? (
            <>
              {driver.name || 'محدد'}{' '}
              {driver.phone && (
                <a href={`tel:${driver.phone}`} className="text-brand" dir="ltr">
                  {driver.phone}
                </a>
              )}
            </>
          ) : (
            'لا يوجد سائق'
          )}
        </p>
        {editable && !edit && (
          <button type="button" onClick={() => setEdit(true)} className={`${btn} border border-line bg-white`}>
            تعديل
          </button>
        )}
      </div>
      {edit && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={has} onChange={(e) => setHas(e.target.checked)} />
            <span>يوجد سائق لهذه اللجنة</span>
          </label>
          {has && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم السائق" className={input} aria-label="اسم السائق" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="رقم السائق" className={input} dir="ltr" aria-label="رقم السائق" />
            </div>
          )}
          {error && <p role="alert" className="text-rose-700">{error}</p>}
          <button
            type="button"
            onClick={() =>
              StaffApi.setDriver(committee.id, { hasDriver: has, name, phone })
                .then(() => {
                  setEdit(false);
                  onSaved();
                })
                .catch((err) => setError(errorMessage(err)))
            }
            className={`${btn} bg-brand text-white`}
          >
            حفظ السائق
          </button>
        </div>
      )}
    </div>
  );
};

const CeremonyBox: React.FC<{ committee: Committee; editable: boolean; onSaved: () => void }> = ({ committee, editable, onSaved }) => {
  const d = committee.ceremonyDetails;
  const [edit, setEdit] = useState(false);
  const [date, setDate] = useState(d?.ceremonyDate ?? '');
  const [time, setTime] = useState(d?.ceremonyTime ?? '');
  const [place, setPlace] = useState(d?.ceremonyPlace ?? '');
  const [honored, setHonored] = useState(d?.honoredStudentsCount != null ? String(d.honoredStudentsCount) : '');
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <p>
        {d?.ceremonyDate || d?.ceremonyPlace ? (
          <>
            <span className="font-bold">الموعد: </span>
            {[d?.ceremonyDate, d?.ceremonyTime].filter(Boolean).join(' ') || 'لم يُحدد'}
            <span className="font-bold mr-3">المكان: </span>
            {d?.ceremonyPlace || 'لم يُحدد'}
            {d?.honoredStudentsCount != null && <span className="mr-3">المكرّمون: {d.honoredStudentsCount}</span>}
          </>
        ) : (
          <span className="text-muted">لم تُنشأ الحفلة بعد.</span>
        )}
        {editable && !edit && (
          <button type="button" onClick={() => setEdit(true)} className={`${btn} border border-line bg-white mr-2`}>
            {d?.ceremonyDate ? 'تعديل الحفلة' : 'إنشاء الحفلة'}
          </button>
        )}
      </p>
      {edit && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} aria-label="تاريخ الحفلة" />
          <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="الوقت (مثال: 7 م)" className={input} aria-label="وقت الحفلة" />
          <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="مكان الحفلة" className={input} aria-label="مكان الحفلة" />
          <input
            type="number"
            min={0}
            value={honored}
            onChange={(e) => setHonored(e.target.value)}
            placeholder="عدد المكرّمين"
            className={input}
            aria-label="عدد المكرّمين"
          />
          {error && <p role="alert" className="text-rose-700 sm:col-span-2">{error}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={() =>
                StaffApi.saveCeremony(committee.id, {
                  ceremonyDate: date,
                  ceremonyTime: time,
                  ceremonyPlace: place,
                  honoredStudentsCount: honored === '' ? null : Number(honored),
                })
                  .then(() => {
                    setEdit(false);
                    onSaved();
                  })
                  .catch((err) => setError(errorMessage(err)))
              }
              className={`${btn} bg-brand text-white`}
            >
              حفظ الحفلة
            </button>
            <button type="button" onClick={() => setEdit(false)} className={`${btn} border border-line bg-white`}>
              إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
