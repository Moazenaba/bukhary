-- Migration 006: real date and timestamp types.
--
-- Dates were stored as TEXT in mixed formats (ISO, "2026/09/20 - 08:00 ص", free text), so
-- ORDER BY sorted them wrongly and nothing stopped garbage. Each column is converted here.
-- A value that cannot be read is NOT dropped: it is copied to a `<column>_raw` column so it
-- can be reviewed. Schedule task dates are required, so an unreadable one stops this migration.

CREATE OR REPLACE FUNCTION parse_legacy_date(v TEXT) RETURNS DATE
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE d TEXT;
BEGIN
  IF v IS NULL THEN RETURN NULL; END IF;
  IF v ~ '^\d{4}-\d{2}-\d{2}' THEN d := substring(v FROM 1 FOR 10);
  ELSIF v ~ '^\d{4}/\d{2}/\d{2}' THEN d := replace(substring(v FROM 1 FOR 10), '/', '-');
  ELSE RETURN NULL;
  END IF;
  RETURN d::date;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION parse_legacy_timestamp(v TEXT) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF v IS NULL THEN RETURN NULL; END IF;
  -- Full ISO timestamps keep their time and offset. Date-only values are taken as UTC midnight.
  IF v ~ '^\d{4}-\d{2}-\d{2}T' THEN RETURN v::timestamptz; END IF;
  IF parse_legacy_date(v) IS NOT NULL THEN RETURN parse_legacy_date(v)::timestamp AT TIME ZONE 'UTC'; END IF;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

-- Stop before converting if a required column has unreadable values.
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM schedule_tasks WHERE parse_legacy_date(date) IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'schedule_tasks.date: % row(s) hold a date that cannot be read; fix them, then re-run', n;
  END IF;
END $$;

ALTER TABLE courses ADD COLUMN start_date_raw TEXT;
ALTER TABLE courses ADD COLUMN end_date_raw TEXT;
ALTER TABLE courses ADD COLUMN created_at_raw TEXT;
UPDATE courses SET start_date_raw = start_date WHERE start_date IS NOT NULL AND parse_legacy_date(start_date) IS NULL;
UPDATE courses SET end_date_raw = end_date WHERE end_date IS NOT NULL AND parse_legacy_date(end_date) IS NULL;
UPDATE courses SET created_at_raw = created_at WHERE created_at IS NOT NULL AND parse_legacy_timestamp(created_at) IS NULL;
ALTER TABLE courses ALTER COLUMN start_date TYPE DATE USING parse_legacy_date(start_date);
ALTER TABLE courses ALTER COLUMN end_date TYPE DATE USING parse_legacy_date(end_date);
ALTER TABLE courses ALTER COLUMN created_at TYPE TIMESTAMPTZ USING parse_legacy_timestamp(created_at);

ALTER TABLE committees ADD COLUMN created_date_raw TEXT;
UPDATE committees SET created_date_raw = created_date WHERE created_date IS NOT NULL AND parse_legacy_date(created_date) IS NULL;
ALTER TABLE committees ALTER COLUMN created_date TYPE DATE USING parse_legacy_date(created_date);
-- created_at_time stays TEXT on purpose: it is a time of day for display, not a timestamp.

ALTER TABLE app_users ADD COLUMN created_at_raw TEXT;
ALTER TABLE app_users ADD COLUMN approved_at_raw TEXT;
UPDATE app_users SET created_at_raw = created_at WHERE created_at IS NOT NULL AND parse_legacy_timestamp(created_at) IS NULL;
UPDATE app_users SET approved_at_raw = approved_at WHERE approved_at IS NOT NULL AND parse_legacy_timestamp(approved_at) IS NULL;
ALTER TABLE app_users ALTER COLUMN created_at TYPE TIMESTAMPTZ USING parse_legacy_timestamp(created_at);
ALTER TABLE app_users ALTER COLUMN approved_at TYPE TIMESTAMPTZ USING parse_legacy_timestamp(approved_at);

ALTER TABLE exams ADD COLUMN uploaded_at_raw TEXT;
UPDATE exams SET uploaded_at_raw = uploaded_at WHERE uploaded_at IS NOT NULL AND parse_legacy_timestamp(uploaded_at) IS NULL;
ALTER TABLE exams ALTER COLUMN uploaded_at TYPE TIMESTAMPTZ USING parse_legacy_timestamp(uploaded_at);

ALTER TABLE schedule_tasks ALTER COLUMN date TYPE DATE USING parse_legacy_date(date);
ALTER TABLE schedule_tasks ALTER COLUMN completed_at TYPE TIMESTAMPTZ USING parse_legacy_timestamp(completed_at);
