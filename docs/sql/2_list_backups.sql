-- النسخ الموجودة: اسم كل نسخة، وقتها، وحجمها.
SELECT n.nspname AS "اسم النسخة",
       obj_description(n.oid, 'pg_namespace') AS "الوقت",
       pg_size_pretty(sum(pg_total_relation_size(c.oid))) AS "الحجم",
       count(c.oid) AS "عدد الجداول"
FROM pg_namespace n LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relkind = 'r'
WHERE n.nspname LIKE 'backup\_%' OR n.nspname LIKE 'before\_restore\_%'
GROUP BY n.oid, n.nspname ORDER BY n.nspname DESC;
