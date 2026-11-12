import { z } from 'zod';
import { badRequest } from './http.ts';
import type { Action } from './policy.ts';
import { STAGE_KEYS, type StageKey, ceremonyDetails, dateOnly } from './schemas.ts';

// Committee workflow rules, shared by web and Android (API-10, MOB-07). Clients send intents;
// the server decides the resulting state, stamps who and when, and enforces the stage order.
// Semantics follow the web client (D-03): reception and readiness approval are records, not
// stage completions; every stage is completed explicitly and only after the previous one.

export const STAGE_ACTION: Record<StageKey, Action> = {
  registration: 'committees.reception',
  exam: 'committees.reception',
  scoring: 'committees.scoring',
  aggregation: 'committees.scoring',
  review: 'committees.scoring',
  sheet: 'committees.finalize',
  accreditation: 'committees.finalize',
  announcement: 'committees.finalize',
  ceremony: 'committees.finalize',
};

const stageKey = z.enum(STAGE_KEYS);

export const committeeAction = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('receive'),
    status: z.enum(['received', 'in_delivery']).default('received'),
    phone: z.string().max(50).nullish(),
    notes: z.string().max(2000).nullish(),
  }),
  z.object({ type: z.literal('cancelReception') }),
  z.object({ type: z.literal('approveReadiness'), notes: z.string().max(2000).nullish() }),
  z.object({ type: z.literal('revokeReadiness') }),
  z.object({ type: z.literal('completeStage'), stage: stageKey, notes: z.string().max(2000).nullish() }),
  z.object({ type: z.literal('reopenStage'), stage: stageKey }),
  z.object({
    type: z.literal('updateQuestion'),
    questionId: z.string().max(100),
    completed: z.boolean().optional(),
    scorers: z.array(z.string().max(200)).max(20).optional(),
    score: z.number().nullish(),
    notes: z.string().max(2000).nullish(),
  }),
  z.object({
    type: z.literal('updateAggregation'),
    aggregatorName: z.string().max(200).nullish(),
    scoringReviewerName: z.string().max(200).nullish(),
    aggregationReviewerName: z.string().max(200).nullish(),
    reviewConfirmed: z.boolean().optional(),
    date: dateOnly,
    notes: z.string().max(5000).nullish(),
  }),
  z.object({
    type: z.literal('scheduleCeremony'),
    ceremonyDate: dateOnly,
    ceremonyTime: z.string().max(100).nullish(),
    ceremonyPlace: z.string().max(300).nullish(),
    honoredStudentsCount: z.coerce.number().int().min(0).max(100_000).nullish(),
    attendingSheikhs: z.array(z.string().max(200)).max(50).optional(),
    notes: z.string().max(5000).nullish(),
    /** Accounts invited to the ceremony; omitted = unchanged. Names are looked up by the server. */
    attendeeUserIds: z.array(z.string().max(255)).max(200).optional(),
  }),
]);
export type CommitteeAction = z.infer<typeof committeeAction>;

export interface CommitteeState {
  stages: Record<string, any>;
  receivedByAssistant: any | null;
  examApprovedBy: any | null;
  scoringDetails: any;
  aggregationDetails: any;
  ceremonyDetails: any;
}

export interface Actor {
  id: string;
  name: string;
}

/** The permission an action needs (committee scope is checked separately). */
export function actionPermission(a: CommitteeAction): Action {
  switch (a.type) {
    case 'receive':
    case 'cancelReception':
    case 'approveReadiness':
    case 'revokeReadiness':
      return 'committees.reception';
    case 'completeStage':
    case 'reopenStage':
      return STAGE_ACTION[a.stage];
    case 'updateQuestion':
    case 'updateAggregation':
      return 'committees.scoring';
    case 'scheduleCeremony':
      return 'committees.finalize';
  }
}

const isDone = (stages: Record<string, any>, k: StageKey) => Boolean(stages?.[k]?.completed);

/** The organisation works in Egypt: «today» for ceremony dates is the date in Cairo. */
export const APP_TIME_ZONE = 'Africa/Cairo';
export const localDate = (iso: string) => {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(Number.isNaN(d.getTime()) ? new Date() : d);
};

/** A ceremony cannot be marked as held before its scheduled day. */
export function assertCeremonyHeldDate(ceremonyDetails: any, now: string) {
  const date = typeof ceremonyDetails?.ceremonyDate === 'string' ? ceremonyDetails.ceremonyDate.slice(0, 10) : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date > localDate(now)) {
    throw badRequest(`موعد الحفل (${date}) لم يأتِ بعد؛ لا يمكن تسجيل «تم الحفل» قبل موعده. عدّل الموعد إن كان الحفل أُقيم بالفعل.`);
  }
}

/**
 * Stage flags sent as a whole (committee save, older clients) must still follow the stage order:
 * - completing a stage completes every earlier stage too (server-stamped), so no gaps remain;
 * - an earlier stage cannot be reopened while a later one stays completed (same rule as reopenStage).
 * Returns the completed/reopened stage keys so the caller can check permissions for them.
 */
export function normalizeStageOrder(
  before: Record<string, any>,
  stages: Record<string, any>,
  actor: Actor,
  now: string,
  ceremonyDetails?: any
): { changed: StageKey[] } {
  const last = STAGE_KEYS.reduce((acc, k, i) => (isDone(stages, k) ? i : acc), -1);
  for (let i = 0; i < last; i++) {
    const k = STAGE_KEYS[i];
    if (isDone(stages, k)) continue;
    if (isDone(before, k)) {
      throw badRequest('لا يمكن إلغاء مرحلة تليها مراحل مكتملة', { stage: k, later: STAGE_KEYS.slice(i + 1).filter((x) => isDone(stages, x)) });
    }
    stages[k] = { ...(stages[k] ?? {}), completed: true, completedAt: now, completedBy: actor.name };
  }
  const changed = STAGE_KEYS.filter((k) => isDone(stages, k) !== isDone(before, k));
  if (changed.includes('ceremony') && isDone(stages, 'ceremony')) assertCeremonyHeldDate(ceremonyDetails, now);
  return { changed };
}

/** Applies one intent. Pure: returns the new state or throws a 400 for an invalid transition. */
export function applyCommitteeAction(state: CommitteeState, a: CommitteeAction, actor: Actor, now: string): CommitteeState {
  const next: CommitteeState = structuredClone(state);
  next.stages = { ...Object.fromEntries(STAGE_KEYS.map((k) => [k, { completed: false }])), ...(next.stages ?? {}) };
  switch (a.type) {
    case 'receive':
      next.receivedByAssistant = { status: a.status, phone: a.phone ?? null, notes: a.notes ?? null, assistantId: actor.id, assistantName: actor.name, receivedAt: now };
      return next;
    case 'cancelReception':
      next.receivedByAssistant = null;
      return next;
    case 'approveReadiness':
      next.examApprovedBy = { notes: a.notes ?? null, assistantId: actor.id, assistantName: actor.name, approvedAt: now };
      return next;
    case 'revokeReadiness':
      next.examApprovedBy = null;
      return next;
    case 'completeStage': {
      const i = STAGE_KEYS.indexOf(a.stage);
      if (isDone(next.stages, a.stage)) return next;
      const missing = STAGE_KEYS.slice(0, i).filter((k) => !isDone(next.stages, k));
      if (missing.length) throw badRequest('يجب إكمال المراحل السابقة أولاً', { missing });
      if (a.stage === 'ceremony') assertCeremonyHeldDate(next.ceremonyDetails, now);
      next.stages[a.stage] = { completed: true, completedAt: now, completedBy: actor.name, notes: a.notes ?? next.stages[a.stage]?.notes ?? null };
      return next;
    }
    case 'reopenStage': {
      const i = STAGE_KEYS.indexOf(a.stage);
      if (!isDone(next.stages, a.stage)) return next;
      const later = STAGE_KEYS.slice(i + 1).filter((k) => isDone(next.stages, k));
      if (later.length) throw badRequest('لا يمكن إلغاء مرحلة تليها مراحل مكتملة', { later });
      next.stages[a.stage] = { completed: false, notes: next.stages[a.stage]?.notes ?? null };
      return next;
    }
    case 'updateQuestion': {
      const details = { questions: [], ...(next.scoringDetails ?? {}) };
      const q = details.questions.find((x: any) => x.id === a.questionId);
      if (!q) throw badRequest('السؤال غير موجود في هذه اللجنة');
      if (a.completed !== undefined && a.completed !== Boolean(q.completed)) {
        q.completed = a.completed;
        q.completedAt = a.completed ? now : null;
      }
      if (a.scorers !== undefined) q.scorers = a.scorers;
      if (a.score !== undefined) q.score = a.score;
      if (a.notes !== undefined) q.notes = a.notes;
      next.scoringDetails = details;
      return next;
    }
    case 'updateAggregation': {
      const { type: _t, ...fields } = a;
      const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      next.aggregationDetails = { ...(next.aggregationDetails ?? {}), ...clean };
      return next;
    }
    case 'scheduleCeremony': {
      // Attendees are resolved against app_users by the route; the intent only carries their ids.
      const { type: _t, attendeeUserIds: _ids, ...fields } = a;
      const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      next.ceremonyDetails = ceremonyDetails.parse({ ...(next.ceremonyDetails ?? {}), ...clean });
      return next;
    }
  }
}

/**
 * Stage changes from older clients (PATCH stages): the client's flags are applied, but the
 * timestamp of a newly completed stage is the server's, and unchanged stages keep theirs.
 */
export function mergeLegacyStages(existing: Record<string, any>, incoming: Record<string, any>, actor: Actor, now: string) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(incoming)) {
    const before = existing?.[k];
    if (v.completed && !before?.completed) out[k] = { ...v, completed: true, completedAt: now, completedBy: actor.name };
    else if (v.completed) out[k] = { ...v, completedAt: before?.completedAt ?? now, completedBy: before?.completedBy ?? actor.name };
    else out[k] = { completed: false, notes: v.notes ?? null };
  }
  return out;
}
