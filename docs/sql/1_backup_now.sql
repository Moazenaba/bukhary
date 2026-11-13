-- =====================================================================
-- نسخة احتياطية كاملة فورية — الصقه كله في Supabase ← SQL Editor ← Run
-- بينسخ كل جداول قاعدة البيانات (بكل الصفوف، وملفات الامتحانات PDF) في
-- مكان منفصل جوه نفس القاعدة اسمه backup_<التاريخ>_<الساعة>.
-- ما بيغيّرش ولا بيمسح أي حاجة في البيانات الأصلية.
-- =====================================================================
DO $$
DECLARE
  s text := 'backup_' || to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYYMMDD_HH24MISS');
  t record;
  r text;
BEGIN
  EXECUTE format('CREATE SCHEMA %I', s);
  FOR t IN
    SELECT c.relname FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
    ORDER BY c.relname
  LOOP
    EXECUTE format('CREATE TABLE %I.%I AS TABLE public.%I', s, t.relname, t.relname);
  END LOOP;
  -- The copy is for the database owner only: never reachable from the website or the public API.
  EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC', s);
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA %I FROM %I', s, r);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM %I', s, r);
    END IF;
  END LOOP;
  EXECUTE format('COMMENT ON SCHEMA %I IS %L', s, 'Full backup taken ' || now()::text);
END $$;

-- النتيجة: كل جدول، عدد صفوفه في الأصل وفي النسخة. لازم العمودين يبقوا متساويين.
WITH b AS (
  SELECT nspname AS s FROM pg_namespace WHERE nspname LIKE 'backup\_%' ORDER BY nspname DESC LIMIT 1
)
SELECT b.s AS "اسم النسخة", c.relname AS "الجدول",
  (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text::bigint AS "الأصل",
  (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I.%I', b.s, c.relname), false, true, '')))[1]::text::bigint AS "النسخة"
FROM b, pg_class c
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
ORDER BY c.relname;
