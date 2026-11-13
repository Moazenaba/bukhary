-- =====================================================================
-- استرجاع كامل من نسخة — اكتب اسم النسخة في السطر اللي تحت، وبعدين Run.
--  • قبل ما يلمس حاجة، بيعمل نسخة من الوضع الحالي اسمها before_restore_<الوقت>
--    (لو غيرت رأيك، ترجع منها بنفس الطريقة).
--  • كله أو ولا حاجة: لو أي خطوة فشلت، مفيش أي تغيير بيحصل.
-- =====================================================================
DO $$
DECLARE
  src text := 'backup_YYYYMMDD_HHMMSS';   -- ← اكتب اسم النسخة هنا (من 2_list_backups.sql)
  safety text := 'before_restore_' || to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYYMMDD_HH24MISS');
  tables text[];
  done text[] := '{}';
  t text;
  cols text;
  progress boolean;
  r text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = src) THEN
    RAISE EXCEPTION 'النسخة % غير موجودة. شغّل 2_list_backups.sql واكتب الاسم بالظبط.', src;
  END IF;

  -- Tables that exist both now and in the backup.
  SELECT array_agg(c.relname ORDER BY c.relname) INTO tables
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
    AND EXISTS (SELECT 1 FROM pg_class b WHERE b.relnamespace = src::regnamespace AND b.relname = c.relname);

  -- 1) Safety copy of the current state.
  EXECUTE format('CREATE SCHEMA %I', safety);
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('CREATE TABLE %I.%I AS TABLE public.%I', safety, t, t);
  END LOOP;
  EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC', safety);
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA %I FROM %I', safety, r);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM %I', safety, r);
    END IF;
  END LOOP;
  EXECUTE format('COMMENT ON SCHEMA %I IS %L', safety, 'State before restoring ' || src || ' at ' || now()::text);

  -- 2) Empty the current tables (all together, so their links do not block it).
  EXECUTE 'TRUNCATE ' || (SELECT string_agg(format('public.%I', x), ', ') FROM unnest(tables) x);

  -- 3) Put the rows back, parents before children (courses before committees, and so on).
  LOOP
    progress := false;
    FOREACH t IN ARRAY tables LOOP
      CONTINUE WHEN t = ANY (done);
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM pg_constraint k
        WHERE k.contype = 'f' AND k.conrelid = format('public.%I', t)::regclass
          AND k.confrelid <> k.conrelid
          AND (SELECT relname FROM pg_class WHERE oid = k.confrelid) = ANY (tables)
          AND NOT (SELECT relname FROM pg_class WHERE oid = k.confrelid) = ANY (done)
      );
      -- Only the columns both versions have (a newer schema may have added columns).
      SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum) INTO cols
      FROM pg_attribute a
      WHERE a.attrelid = format('public.%I', t)::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
        AND EXISTS (SELECT 1 FROM pg_attribute b WHERE b.attrelid = format('%I.%I', src, t)::regclass AND b.attname = a.attname AND NOT b.attisdropped);
      EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM %I.%I', t, cols, cols, src, t);
      done := done || t;
      progress := true;
    END LOOP;
    EXIT WHEN NOT progress;
  END LOOP;
  IF cardinality(done) <> cardinality(tables) THEN
    RAISE EXCEPTION 'تعذر ترتيب الجداول للاسترجاع؛ لم يتغير شيء.';
  END IF;
  RAISE NOTICE 'تم الاسترجاع من % (% جدول). الوضع القديم محفوظ في %.', src, cardinality(done), safety;
END $$;
