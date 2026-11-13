-- Migration 022: the exam-observer names and the ceremony-sheikh names were written in the website's
-- code (CommitteeDetailModal), so adding a person needed a programmer. They now live in
-- system_settings («observers», «ceremony_sheikhs») and admins edit them in «إعدادات النظام».
-- The current names are carried over for an existing installation (one that already has
-- accounts); a new, empty database stays empty (no migration seeds data).
INSERT INTO system_settings (key, value, description, updated_at)
SELECT 'observers', '["أحمد المخزنجي", "أحمد سلامة الهلباوي", "أحمد عبد الخالق", "أحمد ماهر", "أسامة عكاشة", "إبراهيم أبو صقر", "إبراهيم أبو موسى 2", "رشاد", "رضا أبو جندي 2", "سلامة البنا", "سلامة زلابية", "سمير أبو علفة", "شيخ احمد صابح", "شيخ ايمن احمد البرانيه", "عبد الله سيد أحمد", "علاء عبد الجليل", "عمر محمود مجدي", "مجاهد السروي", "محمد سلامة", "محمد فرحات", "محمود عبده عيد", "هاني صبري 2", "وليد عبد السلام", "ياسر سلامة", "يوسف المخزنجي", "أدهم مقلد", "محمد النحاس", "محمد ضياء", "معاذ أبو عنبة", "محمد عماد", "أحمد عطا", "محمود الحراني", "محمود المسلماني", "بكر خالد"]'::jsonb, 'أسماء مراقبي الامتحانات المقترحة عند تشكيل اللجان', NOW()
WHERE EXISTS (SELECT 1 FROM app_users)
ON CONFLICT (key) DO NOTHING;

INSERT INTO system_settings (key, value, description, updated_at)
SELECT 'ceremony_sheikhs', '["مهندس محمود مجدي", "الشيخ أشرف مازن", "الشيخ ناصر الضليل", "الشيخ محمد فرحات", "الشيخ سمير أبو علفة", "الشيخ رضا أبو جندي", "الشيخ هيثم سعيد", "الشيخ إبراهيم أبو موسى", "دكتور إبراهيم أبو صقر", "دكتور محمد رويشد", "الشيخ محمود الضليل", "الشيخ أحمد صابح", "الشيخ أحمد الضليل", "الشيخ هاني صبري", "الشيخ عبد الله سيد أحمد", "الشيخ أدهم مقلد", "الشيخ وليد عبد السلام", "الشيخ علاء عبد الجليل"]'::jsonb, 'أسماء المشايخ المقترحة لحضور الحفلات', NOW()
WHERE EXISTS (SELECT 1 FROM app_users)
ON CONFLICT (key) DO NOTHING;
