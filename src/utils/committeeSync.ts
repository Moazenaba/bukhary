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

export function mapCommitteeToCourseRow(c: Committee): SummerCourseRow {
  const safeId = c.id ? `comm-row-${c.id}` : `comm-row-num-${c.committeeNumber}`;
  return {
    id: safeId,
    number: c.committeeNumber,
    sheikh_name: c.sheikhName || c.committeeName || `اللجنة رقم ${c.committeeNumber}`,
    place: c.branch || 'مسجد الإمام البخاري',
    book: c.competitionBook || '',
    students_count: c.studentsCount || 0,
    delivered: isCommitteeDelivered(c),
    corrected: isCommitteeCorrected(c),
    reviewed: isCommitteeReviewed(c),
    announced: isCommitteeAnnounced(c),
    ceremony: isCommitteeCeremony(c),
    struck_out: false,
    uncertain: false,
    notes: c.generalNotes || '',
    committeeId: c.id,
    courseId: c.courseId,
    courseName: c.courseName,
  };
}

/**
 * Synchronize existing rows with committees list:
 * - Updates existing rows linked to committees with latest stage status.
 * - Appends any new committees that do not have a row yet.
 * - Strictly ensures all row IDs are unique to prevent React key duplication errors.
 */
export function syncRowsWithCommittees(
  currentRows: SummerCourseRow[],
  committees: Committee[]
): SummerCourseRow[] {
  if (!committees || committees.length === 0) return currentRows;

  // Deduplicate initial rows by id
  const seenIds = new Set<string>();
  const initialDeduplicated: SummerCourseRow[] = [];

  for (const r of currentRows) {
    if (!r.id || seenIds.has(r.id)) {
      const uniqueId = `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      seenIds.add(uniqueId);
      initialDeduplicated.push({ ...r, id: uniqueId });
    } else {
      seenIds.add(r.id);
      initialDeduplicated.push(r);
    }
  }

  const rowMap = new Map<string, SummerCourseRow>();
  const numMap = new Map<number, SummerCourseRow>();

  initialDeduplicated.forEach((r) => {
    if (r.committeeId) {
      rowMap.set(r.committeeId, r);
    }
    numMap.set(r.number, r);
  });

  const updatedRows = [...initialDeduplicated];

  committees.forEach((c) => {
    const existing = rowMap.get(c.id) || numMap.get(c.committeeNumber);

    if (existing) {
      // Update status in place
      const idx = updatedRows.findIndex((r) => r.id === existing.id);
      if (idx !== -1) {
        updatedRows[idx] = {
          ...updatedRows[idx],
          committeeId: c.id,
          number: c.committeeNumber,
          sheikh_name: updatedRows[idx].sheikh_name || c.sheikhName || c.committeeName,
          place: updatedRows[idx].place || c.branch || 'مسجد الإمام البخاري',
          book: updatedRows[idx].book || c.competitionBook || '',
          students_count:
            updatedRows[idx].students_count !== undefined
              ? updatedRows[idx].students_count
              : (c.studentsCount || 0),
          courseId: updatedRows[idx].courseId || c.courseId,
          courseName: updatedRows[idx].courseName || c.courseName,
          delivered: isCommitteeDelivered(c),
          corrected: isCommitteeCorrected(c),
          reviewed: isCommitteeReviewed(c),
          announced: isCommitteeAnnounced(c),
          ceremony: isCommitteeCeremony(c),
        };
      }
    } else {
      // Add new row for this committee, guaranteeing unique ID
      const newRow = mapCommitteeToCourseRow(c);
      let targetId = newRow.id;
      if (seenIds.has(targetId)) {
        targetId = `${targetId}-${Math.random().toString(36).slice(2, 6)}`;
      }
      seenIds.add(targetId);
      updatedRows.push({ ...newRow, id: targetId });
    }
  });

  return updatedRows;
}
