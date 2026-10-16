-- Migration 008: only the API may read or write the data (API-15).
--
-- Production runs on Supabase, whose Data API (PostgREST) serves the `public` schema to the
-- `anon` and `authenticated` roles. Without RLS, anyone holding the project's anon key could
-- read password hashes, refresh-token hashes and personal data, bypassing every API rule.
--
-- Row-Level Security is enabled on every table with no policies, which denies all rows to every
-- role except the table owner. The Node server connects as the owner, so it is unaffected
-- (FORCE ROW LEVEL SECURITY is deliberately not used). On Supabase the anon/authenticated roles
-- also lose their privileges. On plain PostgreSQL (CI, local) those roles do not exist and that
-- part is skipped.
--
-- lock_public_schema() is re-run by later migrations that create tables.

CREATE OR REPLACE FUNCTION lock_public_schema() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  t record;
  r text;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c
           WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t.relname);
  END LOOP;
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I;', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I;', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I;', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I;', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I;', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I;', r);
    END IF;
  END LOOP;
END $$;

SELECT lock_public_schema();
