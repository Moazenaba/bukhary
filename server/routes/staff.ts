import { Router } from 'express';
import { z } from 'zod';
import { assertAllowed } from '../auth.ts';
import { audit } from '../audit.ts';
import { type Pool, withTransaction } from '../db.ts';
import { badRequest, forbidden, notFound, route } from '../http.ts';
import {
  LIFECYCLE,
  type Principal,
  canStaffCommittee,
  committeeViewer,
  isAdminRole,
  isManagerVisible,
  lifecycleIndex,
} from '../policy.ts';
import { dateOnly, optionalText } from '../schemas.ts';
import {
  LIFECYCLE_LABEL,
  STAFF_SELECT,
  type StaffRow,
  activeStaff,
  addStaff,
  assertLifecycleStep,
  busyOn,
  endStaff,
  label,
  loadCommittee,
  onLifecycleReached,
  ownerOf,
  presentStaff,
  setLifecycle,
  syncLegacy,
} from '../staff.ts';
import { normalizeStageOrder } from '../workflow.ts';
import { STAGE_KEYS } from '../schemas.ts';
import { onCeremonyDone } from './grants.ts';
import { notify, notifyMany } from './notifications.ts';
import { committeeFromRow, syncCeremonyTask } from './committees.ts';

/** The person may see the committee at all (404 otherwise, like a committee that does not exist). */
function assertSees(user: Principal, committee: any) {
  const viewer = committeeViewer(user, committee);
  if (viewer === 'none') throw notFound('اللجنة غير موجودة');
  return viewer;
}

/** May the user add or remove `role` on this committee now? */
function assertMayStaff(user: Principal, committee: any, role: 'observer' | 'ceremony_sheikh') {
  assertAllowed(user, 'committees.members');
  if (!canStaffCommittee(user, committee.id)) throw forbidden('لا تملك صلاحية تعيين أشخاص في هذه اللجنة');
  if (isAdminRole(user.role)) return;
  if (user.role === 'exams_manager' && !isManagerVisible(committee.lifecycle)) throw notFound('اللجنة غير موجودة');
  if (role === 'observer' && lifecycleIndex(committee.lifecycle) < LIFECYCLE.indexOf('observers_open')) {
    throw forbidden('لم يسمح الأدمن بإضافة المراقبين لهذه اللجنة بعد');
  }
  if (role === 'ceremony_sheikh' && lifecycleIndex(committee.lifecycle) < LIFECYCLE.indexOf('accredited')) {
    throw forbidden('يُعيَّن مشايخ الحفلة بعد اعتماد اللجنة');
  }
}

/** The people on a committee as `user` may see them (docs/PLAN_ROLES_AND_FLOW.md 1.4). */
export async function peopleFor(db: Pool | any, user: Principal, committee: any) {
  const viewer = assertSees(user, committee);
  const staff = await activeStaff(db, committee.id);
  const full = viewer === 'admin' || viewer === 'manager';
  const phones = full || viewer === 'owner';
  const owner = await ownerOf(db, committee);
  // A note is for its person: colleagues of the same kind see each other's names, not their notes.
  const seen = (s: StaffRow) => {
    const p = presentStaff(s, { phones });
    return full || viewer === 'owner' || s.user_id === user.id ? p : { ...p, note: undefined };
  };
  const show = (role: string) =>
    full || viewer === 'owner' || (viewer === 'observer' && role === 'observer') || (viewer === 'ceremony_sheikh' && role === 'ceremony_sheikh');
  const out: Record<string, unknown> = {
    viewer,
    lifecycle: committee.lifecycle,
    lifecycleLabel: LIFECYCLE_LABEL[committee.lifecycle as keyof typeof LIFECYCLE_LABEL],
    owner: owner ? { ...(owner.id ? { userId: owner.id } : {}), name: owner.name, ...(owner.phone ? { phone: owner.phone } : {}) } : null,
    ownerCanAssign: staff.some((s) => s.role === 'owner' && s.can_assign),
    observers: show('observer') ? staff.filter((s) => s.role === 'observer').map(seen) : [],
    ceremonySheikhs: show('ceremony_sheikh') ? staff.filter((s) => s.role === 'ceremony_sheikh').map(seen) : [],
    driver: committee.has_driver ? { name: committee.driver_name ?? '', phone: committee.driver_phone ?? '' } : null,
    mine: staff.filter((s) => s.user_id === user.id).map((s) => presentStaff(s)),
  };
  if (full) {
    const { rows } = await db.query(
      `${STAFF_SELECT} WHERE s.committee_id = $1 AND s.status = 'excused' ORDER BY s.ended_at DESC LIMIT 50;`,
      [committee.id]
    );
    out.excused = rows.map((r: StaffRow) => presentStaff(r, { phones }));
  }
  return out;
}

export function staffRouter(pool: Pool) {
  const r = Router();

  r.get('/:id/people', route(async (req, res) => {
    const committee = await loadCommittee(pool, req.params.id);
    res.json({ success: true, ...(await peopleFor(pool, req.user!, committee)) });
  }));

  // One step of the lifecycle. Side effects (notices, held notices, stage records) follow the step.
  r.post('/:id/lifecycle', route(async (req, res) => {
    const { to, note } = z.object({ to: z.enum(LIFECYCLE), note: optionalText(1000) }).parse(req.body);
    const user = req.user!;
    const row = await withTransaction(pool, async (db) => {
      const committee = await loadCommittee(db, req.params.id, true);
      assertSees(user, committee);
      const direction = assertLifecycleStep(user, committee, to);
      if (direction === 'forward' && to === 'sent_to_manager' && !(await ownerOf(db, committee))) {
        throw badRequest('حدد شيخ اللجنة قبل إرسالها للمدير');
      }
      let updated = await setLifecycle(db, committee, to, { id: user.id, name: user.name });
      if (direction === 'forward') {
        // The stage records follow: «تمت المراقبة» closes registration and the exam, the accreditation and the
        // ceremony steps complete their stages (and every earlier one).
        const stageFor: Record<string, (typeof STAGE_KEYS)[number] | undefined> = {
          observed: 'exam',
          accredited: 'accreditation',
          ceremony_done: 'ceremony',
        };
        const stage = stageFor[to];
        if (stage && !updated.stages?.[stage]?.completed) {
          const now = new Date().toISOString();
          const stages = { ...(updated.stages ?? {}), [stage]: { ...(updated.stages?.[stage] ?? {}), completed: true, completedAt: now, completedBy: user.name } };
          normalizeStageOrder(updated.stages ?? {}, stages, user, now, updated.ceremony_details);
          const { rows } = await db.query('UPDATE committees SET stages = $2::jsonb, updated_at = NOW() WHERE id = $1 RETURNING *;', [
            updated.id,
            JSON.stringify(stages),
          ]);
          updated = rows[0];
          if (stage === 'ceremony') {
            await syncCeremonyTask(db, updated, { detailsChanged: false });
            await onCeremonyDone(db, updated.id);
          }
        }
        await onLifecycleReached(db, updated, to);
      } else {
        await syncLegacy(db, { committeeIds: [updated.id] });
      }
      await audit(db, req, 'committee.lifecycle', 'committee', updated.id, { lifecycle: committee.lifecycle }, { lifecycle: to },
        `${LIFECYCLE_LABEL[committee.lifecycle as keyof typeof LIFECYCLE_LABEL] ?? committee.lifecycle} ← ${LIFECYCLE_LABEL[to]}${note ? ` — ${note}` : ''}`);
      return updated;
    });
    res.json({ success: true, committee: committeeFromRow(row) });
  }));

  // Adds an observer or a ceremony sheikh. A same-day conflict answers 409 schedule_conflict until confirmed.
  r.post('/:id/staff', route(async (req, res) => {
    const body = z
      .object({
        userId: z.string().min(1).max(255),
        role: z.enum(['observer', 'ceremony_sheikh']),
        note: optionalText(1000),
        confirmConflicts: z.boolean().default(false),
      })
      .parse(req.body);
    const user = req.user!;
    const row = await withTransaction(pool, async (db) => {
      const committee = await loadCommittee(db, req.params.id, true);
      assertSees(user, committee);
      assertMayStaff(user, committee, body.role);
      if (body.userId === user.id && !isAdminRole(user.role)) throw forbidden('لا يمكنك تعيين نفسك');
      return addStaff(db, req, committee, body);
    });
    res.status(201).json({ success: true, staff: presentStaff(row) });
  }));

  r.delete('/:id/staff/:staffId', route(async (req, res) => {
    const user = req.user!;
    await withTransaction(pool, async (db) => {
      const committee = await loadCommittee(db, req.params.id, true);
      assertSees(user, committee);
      const { rows } = await db.query(`${STAFF_SELECT} WHERE s.id = $1 AND s.committee_id = $2 AND s.status = 'active' FOR UPDATE OF s;`, [
        req.params.staffId,
        committee.id,
      ]);
      const staff = rows[0] as StaffRow | undefined;
      if (!staff) throw notFound('التعيين غير موجود');
      if (staff.role === 'owner') {
        assertAllowed(user, 'committees.owner');
      } else {
        assertAllowed(user, 'committees.members');
        if (!canStaffCommittee(user, committee.id)) throw forbidden('لا تملك صلاحية تعيين أشخاص في هذه اللجنة');
      }
      await endStaff(db, req, committee, staff, { status: 'removed' });
    });
    res.json({ success: true });
  }));

  // The person excuses themself from a job («اعتذار»); the exams manager and the owner are told.
  r.post('/:id/staff/:staffId/excuse', route(async (req, res) => {
    const { reason } = z.object({ reason: optionalText(1000) }).parse(req.body ?? {});
    const user = req.user!;
    await withTransaction(pool, async (db) => {
      const committee = await loadCommittee(db, req.params.id, true);
      const { rows } = await db.query(`${STAFF_SELECT} WHERE s.id = $1 AND s.committee_id = $2 AND s.status = 'active' FOR UPDATE OF s;`, [
        req.params.staffId,
        committee.id,
      ]);
      const staff = rows[0] as StaffRow | undefined;
      if (!staff || staff.user_id !== user.id) throw notFound('التعيين غير موجود');
      await endStaff(db, req, committee, staff, { status: 'excused', reason });
    });
    res.json({ success: true });
  }));

  // The admin sets (or changes) the committee's owner («شيخ اللجنة»).
  r.put('/:id/owner', route(async (req, res) => {
    const { userId } = z.object({ userId: z.string().min(1).max(255) }).parse(req.body);
    const user = req.user!;
    assertAllowed(user, 'committees.owner');
    const row = await withTransaction(pool, async (db) => {
      const committee = await loadCommittee(db, req.params.id, true);
      const current = (await activeStaff(db, committee.id)).find((s) => s.role === 'owner');
      if (current?.user_id === userId) return current;
      if (current) await endStaff(db, req, committee, current, { status: 'removed' });
      return addStaff(db, req, committee, { userId, role: 'owner', confirmConflicts: true });
    });
    res.json({ success: true, staff: presentStaff(row, { phones: true }) });
  }));

  // The exams manager (or an admin) lets the owner staff their committee.
  r.patch('/:id/owner/can-assign', route(async (req, res) => {
    const { value } = z.object({ value: z.boolean() }).parse(req.body);
    const user = req.user!;
    assertAllowed(user, 'committees.delegate');
    await withTransaction(pool, async (db) => {
      const committee = await loadCommittee(db, req.params.id, true);
      assertSees(user, committee);
      const owner = (await activeStaff(db, committee.id)).find((s) => s.role === 'owner');
      if (!owner) throw badRequest('لا يوجد شيخ لجنة لهذه اللجنة');
      if (owner.can_assign === value) return;
      await db.query('UPDATE committee_staff SET can_assign = $2 WHERE id = $1;', [owner.id, value]);
      if (owner.notified_at) {
        await notify(db, {
          title: value ? `يمكنك الآن تعيين المراقبين ومشايخ الحفلة في ${label(committee)}` : `أُلغيت صلاحية التعيين في ${label(committee)}`,
          description: '',
          type: 'info',
          committeeId: committee.id,
          targetUserId: owner.user_id,
          data: { kind: 'staff.can_assign' },
        });
      }
      await audit(db, req, 'staff.canAssign', 'committee', committee.id, { canAssign: owner.can_assign }, { canAssign: value }, owner.user_name);
    });
    res.json({ success: true });
  }));

  // The committee's driver (optional): those going there are told when it changes.
  r.patch('/:id/driver', route(async (req, res) => {
    const body = z.object({ hasDriver: z.boolean(), name: optionalText(200), phone: optionalText(50) }).parse(req.body);
    const user = req.user!;
    assertAllowed(user, 'committees.driver');
    const row = await withTransaction(pool, async (db) => {
      const committee = await loadCommittee(db, req.params.id, true);
      assertSees(user, committee);
      const { rows } = await db.query(
        'UPDATE committees SET has_driver = $2, driver_name = $3, driver_phone = $4, updated_at = NOW() WHERE id = $1 RETURNING *;',
        [committee.id, body.hasDriver, body.hasDriver ? body.name : null, body.hasDriver ? body.phone : null]
      );
      const told = (await activeStaff(db, committee.id)).filter((s) => s.notified_at && s.role !== 'owner').map((s) => s.user_id);
      const changed = committee.has_driver !== body.hasDriver || committee.driver_name !== rows[0].driver_name || committee.driver_phone !== rows[0].driver_phone;
      if (changed && told.length) {
        await notifyMany(db, told, {
          title: body.hasDriver ? `سائق ${label(committee)}` : `لا يوجد سائق لـ${label(committee)}`,
          description: body.hasDriver ? [body.name, body.phone].filter(Boolean).join(' · ') : '',
          type: 'info',
          committeeId: committee.id,
          data: { kind: 'committee.driver' },
        });
      }
      await audit(db, req, 'committee.driver', 'committee', committee.id,
        { hasDriver: committee.has_driver, name: committee.driver_name, phone: committee.driver_phone },
        { hasDriver: body.hasDriver, name: rows[0].driver_name, phone: rows[0].driver_phone });
      return rows[0];
    });
    res.json({ success: true, committee: committeeFromRow(row) });
  }));

  // Creates or changes the committee's ceremony (one per committee): place, day, time. Its sheikhs and the owner are
  // told when the day, time or place change.
  r.post('/:id/ceremony', route(async (req, res) => {
    const body = z
      .object({
        ceremonyDate: dateOnly,
        ceremonyTime: optionalText(100),
        ceremonyPlace: optionalText(300),
        honoredStudentsCount: z.coerce.number().int().min(0).max(100_000).nullish(),
        notes: optionalText(5000),
      })
      .parse(req.body);
    const user = req.user!;
    assertAllowed(user, 'committees.ceremony');
    const row = await withTransaction(pool, async (db) => {
      const committee = await loadCommittee(db, req.params.id, true);
      assertSees(user, committee);
      const before = committee.ceremony_details ?? {};
      const after = {
        ...before,
        ceremonyDate: body.ceremonyDate,
        ceremonyTime: body.ceremonyTime,
        ceremonyPlace: body.ceremonyPlace,
        ...(body.honoredStudentsCount !== undefined ? { honoredStudentsCount: body.honoredStudentsCount } : {}),
        ...(body.notes !== null ? { notes: body.notes } : {}),
        createdAt: before.createdAt ?? new Date().toISOString(),
        createdBy: before.createdBy ?? user.name,
      };
      const { rows } = await db.query('UPDATE committees SET ceremony_details = $2::jsonb, updated_at = NOW() WHERE id = $1 RETURNING *;', [
        committee.id,
        JSON.stringify(after),
      ]);
      await syncCeremonyTask(db, rows[0]);
      const moved = ['ceremonyDate', 'ceremonyTime', 'ceremonyPlace'].some((k) => (before[k] ?? null) !== ((after as any)[k] ?? null));
      if (moved && before.createdAt) {
        const staff = await activeStaff(db, committee.id);
        const to = staff.filter((s) => s.notified_at && (s.role === 'ceremony_sheikh' || s.role === 'owner')).map((s) => s.user_id);
        await notifyMany(db, to, {
          title: `تغيّر موعد أو مكان حفلة ${label(committee)}`,
          description: [after.ceremonyDate, after.ceremonyTime, after.ceremonyPlace].filter(Boolean).join(' · '),
          type: 'urgent',
          committeeId: committee.id,
          data: { kind: 'ceremony.changed' },
        });
      }
      await audit(db, req, before.createdAt ? 'ceremony.update' : 'ceremony.create', 'committee', committee.id, before, after);
      return rows[0];
    });
    res.json({ success: true, committee: committeeFromRow(row) });
  }));

  return r;
}

/** Who is free on a day: available, without any job at all, or busy (and with what). */
export function peopleRouter(pool: Pool) {
  const r = Router();
  r.get('/availability', route(async (req, res) => {
    const user = req.user!;
    assertAllowed(user, 'people.availability');
    const q = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'التاريخ يجب أن يكون بصيغة YYYY-MM-DD') }).parse(req.query);
    const { rows: people } = await pool.query(
      `SELECT u.id, u.name, u.role, u.phone,
              EXISTS (SELECT 1 FROM committee_staff s JOIN committees c ON c.id = s.committee_id
                      WHERE s.user_id = u.id AND s.status = 'active' AND c.lifecycle <> 'ceremony_done') AS has_jobs
       FROM app_users u WHERE u.status = 'approved' AND u.role IN ('committee_head', 'sheikh') ORDER BY u.name;`
    );
    const busy = await busyOn(pool, people.map((p) => p.id), q.date);
    const byUser = new Map<string, typeof busy>();
    for (const b of busy) byUser.set(b.userId, [...(byUser.get(b.userId) ?? []), b]);
    const person = (p: any) => ({ id: p.id, name: p.name, role: p.role, ...(p.phone ? { phone: p.phone } : {}) });
    res.json({
      success: true,
      date: q.date,
      available: people.filter((p) => !byUser.has(p.id)).map(person),
      unassigned: people.filter((p) => !p.has_jobs).map(person),
      busy: people.filter((p) => byUser.has(p.id)).map((p) => ({ ...person(p), items: byUser.get(p.id)!.map(({ userId: _u, ...i }) => i) })),
    });
  }));
  return r;
}

