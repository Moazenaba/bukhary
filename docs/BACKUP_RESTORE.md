# 🛡️ دليل النسخ الاحتياطي والاستعادة (BACKUP_RESTORE.md)
## Bukhari Competition Database - Backup & Disaster Recovery Guide

---

## 1. سياسة النسخ الاحتياطي (Backup Policy)

قاعدة ذهبية: **ممنوع تشغيل أي ترحيل (migration) على بيئة الإنتاج قبل أخذ نسخة احتياطية كاملة.**

يتم تنفيذ النسخ الاحتياطي عبر الأمر:
```bash
npm run backup
```

يقوم هذا الأمر باستخراج بيانات كافة الجداول:
- `courses`
- `committees`
- `app_users`
- `exams`
- `schedule_tasks`
- `scoring_records`
- `audit_logs`
- `notifications`
- `system_settings`

وحفظها في ملف JSON مضغوط ومؤرخ داخل مجلد `backups/backup-<TIMESTAMP>.json`.

---

## 2. إجراءات الترحيل على Supabase (Production Migrations)

1. تشغيل النسخ الاحتياطي: `npm run backup`.
2. التحقق من اكتمال وحجم ملف النسخة الاحتياطية.
3. طلب موافقة صريحة من المشرف المسؤول قبل تنفيذ أي ترحيل: `npm run migrate:prod`.
4. بعد الموافقة، تشغيل الترحيل ومراجعة سجلات نجاح العملية.

---

## 3. خطة الاستعادة (Restore Procedure)

في حال حدوث أي خطأ أو تعارض أثناء الترحيل:
1. إيقاف العمليات مؤقتاً عبر وضع الصيانة.
2. تشغيل سكريبت الاستعادة وتحديد ملف النسخة الاحتياطية المطلوب استرجاعه.
3. التحقق من تطابق أعداد السجلات في كل جدول بعد الاسترجاع.
