import { Committee, StageKey } from '../types';
import { SummerCourseRow } from '../types/summerCourse';

export function isCommitteeDelivered(c: Committee): boolean {
  return Boolean(
    c.receivedByAssistant?.status === 'received' ||
    c.stages.exam?.completed ||
    c.stages.scoring?.completed ||
    c.stages.aggregation?.completed ||
    c.stages.review?.completed ||
    c.stages.sheet?.completed ||
    c.stages.accreditation?.completed ||
    c.stages.announcement?.completed ||
    c.stages.ceremony?.completed
  );
}

export function isCommitteeCorrected(c: Committee): boolean {
  return Boolean(
    c.stages.scoring?.completed ||
    c.stages.aggregation?.completed ||
    c.stages.review?.completed ||
    c.stages.sheet?.completed ||
    c.stages.accreditation?.completed ||
    c.stages.announcement?.completed ||
    c.stages.ceremony?.completed
  );
}

export function isCommitteeReviewed(c: Committee): boolean {
  return Boolean(
    c.stages.review?.completed ||
    c.stages.sheet?.completed ||
    c.stages.accreditation?.completed ||
    c.stages.announcement?.completed ||
    c.stages.ceremony?.completed
  );
}

export function isCommitteeAnnounced(c: Committee): boolean {
  return Boolean(
    c.stages.announcement?.completed ||
    c.stages.ceremony?.completed
  );
}

export function isCommitteeCeremony(c: Committee): boolean {
  return Boolean(c.stages.ceremony?.completed);
}

export const ROW_STAGE: Record<'delivered' | 'corrected' | 'reviewed' | 'announced' | 'ceremony', StageKey> = {
  delivered: 'exam',
  corrected: 'scoring',
  reviewed: 'review',
  announced: 'announcement',
  ceremony: 'ceremony',
};

/** Sheet flags shown for a committee. A later completed stage implies the earlier ones. */
export function committeeFlags(c: Committee) {
  return {
    delivered: isCommitteeDelivered(c),
    corrected: isCommitteeCorrected(c),
    reviewed: isCommitteeReviewed(c),
    announced: isCommitteeAnnounced(c),
    ceremony: isCommitteeCeremony(c),
  };
}

/**
 * Rows to display in the course sheet:
 * - saved rows linked to a committee show that committee's stage flags (the committee is the source of truth);
 * - saved rows without a committee keep their own flags;
 * - committees that have no saved row appear as read-only "virtual" rows built from the committee.
 * Nothing here is written to the server; edits go through explicit saves.
 */
export function mergeRowsWithCommittees(savedRows: SummerCourseRow[], committees: Committee[]): SummerCourseRow[] {
  const byId = new Map(committees.map((c) => [c.id, c]));
  const linked = new Set<string>();
  const out: SummerCourseRow[] = savedRows.map((r) => {
    const c = r.committeeId ? byId.get(r.committeeId) : undefined;
    if (!c) return r;
    linked.add(c.id);
    return {
      ...r,
      number: c.committeeNumber,
      sheikh_name: r.sheikh_name || c.sheikhName || c.committeeName,
      place: r.place || c.branch || '',
      book: r.book || c.competitionBook || '',
      students_count: r.students_count || c.studentsCount || 0,
      courseId: c.courseId,
      courseName: c.courseName,
      ...committeeFlags(c),
    };
  });
  for (const c of committees) {
    if (linked.has(c.id)) continue;
    out.push({
      id: `committee:${c.id}`,
      virtual: true,
      number: c.committeeNumber,
      sheikh_name: c.sheikhName || c.committeeName,
      place: c.branch || '',
      book: c.competitionBook || '',
      students_count: c.studentsCount || 0,
      struck_out: false,
      uncertain: false,
      notes: '',
      committeeId: c.id,
      courseId: c.courseId,
      courseName: c.courseName,
      ...committeeFlags(c),
    });
  }
  return out.sort((a, b) => a.number - b.number);
}
