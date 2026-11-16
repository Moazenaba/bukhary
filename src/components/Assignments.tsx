import React, { useCallback, useEffect, useState } from 'react';
import { AssignmentNote, AssignmentStatus, AssignmentTask, Committee, CommitteeAssignment } from '../types';
import { AssignableUser, DataService } from '../services/DataService';
import { AuthService } from '../services/AuthService';
import { errorMessage } from '../services/api';

// «مراقب»: an extra job on top of a person's role. They stay a sheikh (with their own committee) and are
// sent to another committee for its exam or its ceremony. The server enforces everything; these panels
// only show and edit the assignments it accepts.

export const TASK_LABEL: Record<AssignmentTask, string> = { exam: 'مراقبة امتحان', ceremony: 'متابعة حفل' };
const STATUS_LABEL: Record<AssignmentStatus, string> = { active: 'نشط', ended: 'منتهي', cancelled: 'ملغي' };
const STATUS_CLASS: Record<AssignmentStatus, string> = {
  active: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  ended: 'bg-slate-100 text-slate-600 border-slate-200',
  cancelled: 'bg-rose-50 text-rose-800 border-rose-200',
};

export const assignmentDates = (a: Pick<CommitteeAssignment, 'startsOn' | 'endsOn'>) =>
  [a.startsOn && `من ${a.startsOn}`, a.endsOn && `حتى ${a.endsOn}`].filter(Boolean).join(' ') || 'بدون تاريخ محدد';

function useAssignments(filter: { committeeId?: string; userId?: string }, enabled = true) {
  const [list, setList] = useState<CommitteeAssignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = `${filter.committeeId ?? ''}|${filter.userId ?? ''}`;
  const reload = useCallback(() => {
    if (!enabled) return;
    DataService.getAssignments(filter)
      .then((l) => {
        setList(l);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  useEffect(reload, [reload]);
  return { list, error, setError, reload };
}

const StatusPill: React.FC<{ status: AssignmentStatus }> = ({ status }) => (
  <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
);

const FinishButtons: React.FC<{ a: CommitteeAssignment; onDone: () => void; onError: (m: string) => void }> = ({ a, onDone, onError }) => {
  if (a.status !== 'active') return null;
  const finish = async (how: 'end' | 'cancel') => {
    if (!window.confirm(how === 'end' ? 'إنهاء هذا التكليف؟ تنتهي صلاحيات المراقبة فورًا.' : 'إلغاء هذا التكليف؟')) return;
    try {
      await DataService.finishAssignment(a.id, how);
      onDone();
    } catch (err) {
      onError(errorMessage(err));
    }
  };
  return (
    <span className="flex gap-1.5">
      <button type="button" onClick={() => void finish('end')} className="px-2 py-1 rounded-lg border border-line font-bold cursor-pointer">
        إنهاء
      </button>
      <button type="button" onClick={() => void finish('cancel')} className="px-2 py-1 rounded-lg border border-rose-200 text-rose-700 font-bold cursor-pointer">
        إلغاء
      </button>
    </span>
  );
};

/** Committee page, for whoever may assign: the people sent to observe this committee, and a form to add one. */
export const CommitteeObserversPanel: React.FC<{ committee: Committee }> = ({ committee }) => {
  const canManage = AuthService.canOnCommittee('assignments.manage', committee);
  const { list, error, setError, reload } = useAssignments({ committeeId: committee.id }, canManage);
  const [people, setPeople] = useState<AssignableUser[] | null>(null);
  const [userId, setUserId] = useState('');
  const [task, setTask] = useState<AssignmentTask>('exam');
  const [endsOn, setEndsOn] = useState('');
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!canManage || !adding || people) return;
    DataService.getCeremonyCandidates()
      .then(setPeople)
      .catch((err) => setError(errorMessage(err)));
  }, [canManage, adding, people, setError]);

  if (!canManage) return null;
  const onCommittee = new Set((committee.staff ?? []).map((s) => s.id));
  const options = (people ?? []).filter((p) => (p.role === 'sheikh' || p.role === 'committee_head') && !onCommittee.has(p.id));

  const add = async () => {
    if (!userId) return setError('اختر الشخص أولًا');
    setSaving(true);
    setError(null);
    try {
      await DataService.createAssignment({ userId, committeeId: committee.id, task, ...(endsOn ? { endsOn } : {}) });
      setUserId('');
      setEndsOn('');
      setAdding(false);
      reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 rounded-2xl border border-line bg-white space-y-3 text-xs" data-testid="observers-panel">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-sm text-ink flex items-center gap-1.5">
          <span className="material-symbols-outlined text-brand">visibility</span>
          <span>المراقبون المكلّفون بهذه اللجنة</span>
        </h3>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="px-3 py-1.5 rounded-lg bg-brand text-white font-bold cursor-pointer">
            تكليف مراقب
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-rose-700 font-semibold">{error}</p>}
      {list === null && !error && <p className="text-muted">جارٍ التحميل…</p>}
      {list?.length === 0 && <p className="text-muted">لا يوجد مراقبون مكلّفون بهذه اللجنة.</p>}
      <ul className="space-y-2">
        {(list ?? []).map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200">
            <span className="space-y-0.5">
              <span className="font-bold text-ink block">{a.userName}</span>
              <span className="text-muted block">
                {TASK_LABEL[a.task]} · {assignmentDates(a)} · أسنده {a.assignedBy}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <StatusPill status={a.status} />
              <FinishButtons a={a} onDone={reload} onError={setError} />
            </span>
          </li>
        ))}
      </ul>
      {adding && (
        <div className="space-y-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
          <label className="block">
            <span className="font-semibold text-slate-700">الشخص</span>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200">
              <option value="">{people ? 'اختر…' : 'جارٍ التحميل…'}</option>
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {AuthService.getRoleLabel(p.role as never)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="font-semibold text-slate-700">المهمة</span>
              <select value={task} onChange={(e) => setTask(e.target.value as AssignmentTask)} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200">
                <option value="exam">{TASK_LABEL.exam}</option>
                <option value="ceremony">{TASK_LABEL.ceremony}</option>
              </select>
            </label>
            <label className="block">
              <span className="font-semibold text-slate-700">ينتهي في (اختياري)</span>
              <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200" />
            </label>
          </div>
          <p className="text-muted">يظل الشخص على رتبته ولجنته، ويرى هذه اللجنة للقراءة فقط (وورقة امتحانها في تكليف الامتحان) حتى ينتهي التكليف.</p>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setAdding(false)} className="px-3 py-1.5 rounded-lg border border-line font-bold cursor-pointer">
              إلغاء
            </button>
            <button type="button" disabled={saving} onClick={() => void add()} className="px-3 py-1.5 rounded-lg bg-brand text-white font-bold cursor-pointer disabled:opacity-50">
              {saving ? 'جارٍ الحفظ…' : 'تكليف'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/** Committee page, for the observer: what they were sent to do here, and a place for their notes. */
export const MyObservationPanel: React.FC<{ committee: Committee }> = ({ committee }) => {
  const mine = AuthService.observingOn(committee);
  const [notes, setNotes] = useState<AssignmentNote[]>([]);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assignmentId = mine[0]?.id;

  const load = useCallback(() => {
    if (!assignmentId) return;
    DataService.getObservations(assignmentId).then(setNotes).catch((err) => setError(errorMessage(err)));
  }, [assignmentId]);
  useEffect(load, [load]);

  if (mine.length === 0 || !assignmentId) return null;
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await DataService.addObservation(assignmentId, text.trim());
      setText('');
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50/60 space-y-3 text-xs" data-testid="my-observation">
      <h3 className="font-bold text-sm text-amber-950 flex items-center gap-1.5">
        <span className="material-symbols-outlined">visibility</span>
        <span>{`أنت مكلّف في هذه اللجنة: ${mine.map((m) => TASK_LABEL[m.task]).join(' و')}`}</span>
      </h3>
      <p className="text-amber-900">صلاحيتك هنا للقراءة وكتابة الملاحظات فقط، وتنتهي بانتهاء التكليف.</p>
      {error && <p role="alert" className="text-rose-700 font-semibold">{error}</p>}
      <ul className="space-y-1.5">
        {notes.map((n) => (
          <li key={n.id} className="p-2 rounded-lg bg-white border border-amber-100">
            <span className="block text-ink">{n.note}</span>
            <span className="text-muted">{new Date(n.at).toLocaleString('ar-EG')}</span>
          </li>
        ))}
      </ul>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        aria-label="ملاحظة المراقبة"
        placeholder="اكتب ملاحظاتك عن سير الامتحان أو الحفل…"
        className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white"
      />
      <div className="flex justify-end">
        <button type="button" disabled={saving || !text.trim()} onClick={() => void save()} className="px-3 py-1.5 rounded-lg bg-brand text-white font-bold cursor-pointer disabled:opacity-50">
          {saving ? 'جارٍ الحفظ…' : 'حفظ الملاحظة'}
        </button>
      </div>
    </div>
  );
};

/** User profile: the primary role stays as it is, with the extra assignments listed under it. */
export const UserAssignmentsPanel: React.FC<{ userId: string; roleLabel: string }> = ({ userId, roleLabel }) => {
  const canSee = AuthService.can('assignments.manage');
  // Loaded on demand: the users list can be long, and each card would otherwise make a request.
  const [open, setOpen] = useState(false);
  const { list, error, setError, reload } = useAssignments({ userId }, canSee && open);
  if (!canSee) return null;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-bold text-brand underline cursor-pointer" data-testid="show-assignments">
        التكليفات الإضافية (مراقب)
      </button>
    );
  }
  return (
    <div className="p-3 rounded-xl bg-amber-50/50 border border-amber-200 text-xs space-y-1.5" data-testid="user-assignments">
      <div className="font-bold text-amber-950">
        الرتبة الأساسية: {roleLabel} <span className="text-muted font-normal">· التكليفات الإضافية (لا تغيّر الرتبة)</span>
      </div>
      {error && <p role="alert" className="text-rose-700 font-semibold">{error}</p>}
      {list?.length === 0 && <p className="text-muted">لا توجد تكليفات إضافية.</p>}
      <ul className="space-y-1.5">
        {(list ?? []).map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-white border border-amber-100">
            <span>
              <span className="font-bold text-ink">
                {TASK_LABEL[a.task]} — لجنة {a.committeeNumber}
              </span>
              <span className="text-muted block">
                {assignmentDates(a)} · أسنده {a.assignedBy}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <StatusPill status={a.status} />
              <FinishButtons a={a} onDone={reload} onError={setError} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
