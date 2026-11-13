import type { CommitteeAction } from '../services/DataService';
import { Committee, STAGES_LIST, StageKey } from '../types';

// Turns "the committee as the server has it" and "the committee after the user's edit" into the
// smallest set of server calls (API-10, API-11, WEB-09). Stage changes and per-item edits become
// workflow intents; only real document or base-data changes replace whole records, and those
// carry the version the client saw.

export type CommitteeStep =
  | { kind: 'action'; action: CommitteeAction }
  | { kind: 'patchScoring'; scoringDetails: NonNullable<Committee['scoringDetails']> }
  | { kind: 'saveBase'; committee: Committee };

/** The server action each stage needs (mirror of server/workflow.ts STAGE_ACTION). */
export const STAGE_ACTION: Record<StageKey, string> = {
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

export const BASE_COMMITTEE_FIELDS = [
  'committeeNumber', 'committeeName', 'associationName', 'members', 'branch', 'competitionBook', 'generalNotes',
  'courseId', 'sheikhName', 'sheikhPhone', 'sheikhCountry', 'studentsCount', 'isWomenCommittee', 'examDate',
] as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const blankToNull = (v: string | undefined | null) => (v === undefined || v === null || v.trim() === '' ? null : v);

const ORDER: StageKey[] = STAGES_LIST.map((s) => s.key);

/** Stage intents in an order the server accepts: reopen from the last stage back, complete from the first forward. */
export function stageSteps(before: Committee['stages'], after: Committee['stages']): CommitteeStep[] {
  const reopen = [...ORDER].reverse().filter((k) => Boolean(before?.[k]?.completed) && !after?.[k]?.completed);
  const complete = ORDER.filter((k) => !before?.[k]?.completed && Boolean(after?.[k]?.completed));
  return [
    ...reopen.map((stage) => ({ kind: 'action' as const, action: { type: 'reopenStage' as const, stage } })),
    ...complete.map((stage) => ({ kind: 'action' as const, action: { type: 'completeStage' as const, stage } })),
  ];
}

export function planCommitteeSave(existing: Committee, updated: Committee): CommitteeStep[] {
  const steps: CommitteeStep[] = [];

  if (BASE_COMMITTEE_FIELDS.some((f) => !same(updated[f], existing[f]))) {
    // Base data only: stages and documents are left out, so the save cannot overwrite them.
    const { stages: _s, scoringDetails: _q, aggregationDetails: _a, ceremonyDetails: _c, ...base } = updated;
    steps.push({ kind: 'saveBase', committee: { ...base, stages: existing.stages } as Committee });
  }

  const qBefore = existing.scoringDetails?.questions ?? [];
  const qAfter = updated.scoringDetails?.questions ?? [];
  const sameQuestionSet =
    qBefore.length === qAfter.length && qBefore.every((q, i) => q.id === qAfter[i]?.id && q.label === qAfter[i]?.label);
  const headerChanged =
    !same(updated.scoringDetails?.scorerName, existing.scoringDetails?.scorerName) ||
    !same(updated.scoringDetails?.scoringReviewerName, existing.scoringDetails?.scoringReviewerName) ||
    !same(updated.scoringDetails?.notes, existing.scoringDetails?.notes);
  if (updated.scoringDetails && (!existing.scoringDetails || !sameQuestionSet || headerChanged)) {
    steps.push({ kind: 'patchScoring', scoringDetails: updated.scoringDetails });
  } else {
    for (const q of qAfter) {
      const prev = qBefore.find((x) => x.id === q.id);
      if (!prev) continue;
      const action: CommitteeAction = { type: 'updateQuestion', questionId: q.id };
      let changed = false;
      if (Boolean(prev.completed) !== Boolean(q.completed)) ((action as any).completed = Boolean(q.completed)), (changed = true);
      if (!same(prev.scorers, q.scorers)) ((action as any).scorers = q.scorers ?? []), (changed = true);
      if (!same(prev.notes, q.notes)) ((action as any).notes = q.notes ?? null), (changed = true);
      if (changed) steps.push({ kind: 'action', action });
    }
  }

  const aBefore = existing.aggregationDetails ?? {};
  const aAfter = updated.aggregationDetails ?? {};
  if (!same(aBefore, aAfter) && updated.aggregationDetails) {
    steps.push({
      kind: 'action',
      action: {
        type: 'updateAggregation',
        aggregatorName: blankToNull(aAfter.aggregatorName),
        scoringReviewerName: blankToNull(aAfter.scoringReviewerName),
        aggregationReviewerName: blankToNull(aAfter.aggregationReviewerName),
        reviewConfirmed: aAfter.reviewConfirmed,
        date: blankToNull(aAfter.date),
        notes: blankToNull(aAfter.notes),
      },
    });
  }

  if (updated.ceremonyDetails && !same(existing.ceremonyDetails, updated.ceremonyDetails)) {
    const c = updated.ceremonyDetails;
    steps.push({
      kind: 'action',
      action: {
        type: 'scheduleCeremony',
        ceremonyDate: blankToNull(c.ceremonyDate),
        ceremonyTime: blankToNull(c.ceremonyTime),
        ceremonyPlace: blankToNull(c.ceremonyPlace),
        honoredStudentsCount: c.honoredStudentsCount ?? null,
        attendingSheikhs: c.attendingSheikhs ?? [],
        notes: blankToNull(c.notes),
      },
    });
  }

  steps.push(...stageSteps(existing.stages, updated.stages));
  return steps;
}

/** The permission each step needs, for disabling controls before the server says no. */
export function stepAction(step: CommitteeStep): string {
  if (step.kind === 'saveBase') return 'committees.update';
  if (step.kind === 'patchScoring') return 'committees.scoring';
  const a = step.action;
  switch (a.type) {
    case 'completeStage':
    case 'reopenStage':
      return STAGE_ACTION[a.stage];
    case 'updateQuestion':
    case 'updateAggregation':
      return 'committees.scoring';
    case 'scheduleCeremony':
      return 'committees.finalize';
    default:
      return 'committees.reception';
  }
}
