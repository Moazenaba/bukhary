-- Migration 005: committee numbers must be unique within a course, including committees
-- without a course. NULL course_id values made the old (course_id, number) index allow duplicates.
DROP INDEX IF EXISTS uq_committees_course_number;
CREATE UNIQUE INDEX uq_committees_course_number ON committees (COALESCE(course_id, ''), committee_number);
