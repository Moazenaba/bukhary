import type { Committee, Course } from '../types';

export interface GroupRow {
  name: string;
  committees: number;
  students: number;
  /** Committees whose ceremony is done. */
  ceremonies: number;
  /** Share of committees whose ceremony is done, 0–100. */
  ceremonyRate: number;
}

const rate = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/** Committees grouped by a key (book, sheikh…), largest first; blank keys go under «غير محدد». */
export function groupBy(committees: Committee[], key: (c: Committee) => string | undefined): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const c of committees) {
    const name = key(c)?.trim() || 'غير محدد';
    const row = map.get(name) ?? { name, committees: 0, students: 0, ceremonies: 0, ceremonyRate: 0 };
    row.committees += 1;
    row.students += c.studentsCount || 0;
    if (c.stages?.ceremony?.completed) row.ceremonies += 1;
    map.set(name, row);
  }
  return [...map.values()]
    .map((r) => ({ ...r, ceremonyRate: rate(r.ceremonies, r.committees) }))
    .sort((a, b) => b.students - a.students || b.committees - a.committees || a.name.localeCompare(b.name, 'ar'));
}

export interface CourseRow extends GroupRow {
  courseId: string;
  current: boolean;
}

/** Every course side by side (newest first), the current one marked, for «مقارنة الدورات». */
export function compareCourses(all: Committee[], courses: Course[], currentCourseId?: string): CourseRow[] {
  const byCourse = new Map(groupByCourse(all).map((r) => [r.courseId, r]));
  return [...courses]
    .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '') || a.name.localeCompare(b.name, 'ar'))
    .map((course) => {
      const r = byCourse.get(course.id);
      return {
        courseId: course.id,
        name: course.name,
        current: course.id === currentCourseId,
        committees: r?.committees ?? 0,
        students: r?.students ?? 0,
        ceremonies: r?.ceremonies ?? 0,
        ceremonyRate: r?.ceremonyRate ?? 0,
      };
    });
}

function groupByCourse(all: Committee[]) {
  const rows = groupBy(all, (c) => c.courseId);
  return rows.map((r) => ({ ...r, courseId: r.name }));
}
