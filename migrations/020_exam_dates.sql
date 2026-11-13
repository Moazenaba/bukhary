-- Migration 020: exam dates (new columns only; nothing is removed or changed).
-- committees.exam_date: the day the committee sits its exam (shown in the screens, used for
--   «late» alerts).
-- exams.opens_at: when the exam paper may be downloaded; until then (minus the hours below) only
--   admins and super admins can download it. Empty = open as before, so no existing exam is locked.
ALTER TABLE committees ADD COLUMN IF NOT EXISTS exam_date DATE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS opens_at TIMESTAMPTZ;

-- The opening window (exam_open_hours_before) defaults to 24 hours in the code
-- (server/routes/systemSettings.ts); nothing is inserted, as no migration seeds data.
