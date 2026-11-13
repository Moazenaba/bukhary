-- Migration 021: one place for a committee's data.
-- From now on a course-sheet row linked to a committee shows the committee's sheikh, place, book
-- and student count (the server ignores those four fields when such a row is saved). Before that,
-- any value written only in the sheet is copied to its committee where the committee has none,
-- so nothing typed in the sheet is lost. The sheet's own columns are kept as they are.
WITH latest AS (
  SELECT DISTINCT ON (committee_id) committee_id, sheikh_name, place, book, students_count
  FROM summer_course_rows
  WHERE committee_id IS NOT NULL
  ORDER BY committee_id, updated_at DESC NULLS LAST
)
UPDATE committees c SET
  sheikh_name = CASE WHEN COALESCE(TRIM(c.sheikh_name), '') = '' AND COALESCE(TRIM(l.sheikh_name), '') <> ''
                     THEN TRIM(l.sheikh_name) ELSE c.sheikh_name END,
  sheikh_country = CASE WHEN COALESCE(TRIM(c.sheikh_country), '') = '' AND COALESCE(TRIM(l.place), '') <> ''
                             AND TRIM(l.place) <> COALESCE(TRIM(c.branch), '')
                        THEN TRIM(l.place) ELSE c.sheikh_country END,
  competition_book = CASE WHEN COALESCE(TRIM(c.competition_book), '') = '' AND COALESCE(TRIM(l.book), '') <> ''
                          THEN TRIM(l.book) ELSE c.competition_book END,
  students_count = CASE WHEN COALESCE(c.students_count, 0) = 0 AND COALESCE(l.students_count, 0) > 0
                        THEN l.students_count ELSE c.students_count END
FROM latest l
WHERE l.committee_id = c.id
  AND (
    (COALESCE(TRIM(c.sheikh_name), '') = '' AND COALESCE(TRIM(l.sheikh_name), '') <> '')
    OR (COALESCE(TRIM(c.sheikh_country), '') = '' AND COALESCE(TRIM(l.place), '') <> '' AND TRIM(l.place) <> COALESCE(TRIM(c.branch), ''))
    OR (COALESCE(TRIM(c.competition_book), '') = '' AND COALESCE(TRIM(l.book), '') <> '')
    OR (COALESCE(c.students_count, 0) = 0 AND COALESCE(l.students_count, 0) > 0)
  );
