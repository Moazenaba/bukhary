import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function runBackup() {
  console.log('🔄 جاري بدء النسخ الاحتياطي لقاعدة بيانات مسابقات مسجد البخاري...');

  const connectionString =
    process.env.SUPABASE_URL ||
    (process.env.SUPABASE_DB_HOST
      ? `postgresql://${process.env.SUPABASE_DB_USER}:${encodeURIComponent(
          process.env.SUPABASE_DB_PASSWORD || ''
        )}@${process.env.SUPABASE_DB_HOST}:${process.env.SUPABASE_DB_PORT || '5432'}/postgres`
      : undefined);

  if (!connectionString) {
    console.warn('⚠️ لم يتم العثور على إعدادات اتصال بقاعدة البيانات. سيتم إنشاء ملف نسخ احتياطي تجريبي فارغ.');
    const backupsDir = path.resolve(process.cwd(), 'backups');
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
    const backupFile = path.join(backupsDir, `backup-offline-${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify({ timestamp: new Date().toISOString(), status: 'offline_empty' }, null, 2));
    console.log(`✅ تم حفظ ملف النسخ الاحتياطي: ${backupFile}`);
    return;
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    const tables = [
      'courses',
      'committees',
      'app_users',
      'exams',
      'schedule_tasks',
      'scoring_records',
      'audit_logs',
      'notifications',
      'system_settings',
    ];

    const backupData: Record<string, any[]> = {
      _metadata: [{
        createdAt: new Date().toISOString(),
        tablesCount: tables.length,
      }],
    };

    for (const table of tables) {
      try {
        const { rows } = await pool.query(`SELECT * FROM "${table}";`);
        backupData[table] = rows;
        console.log(`  ✓ تم استخراج ${rows.length} سجل من جدول ${table}`);
      } catch (err: any) {
        console.warn(`  ⚠️ تعذر استخراج جدول ${table}: ${err.message}`);
        backupData[table] = [];
      }
    }

    const backupsDir = path.resolve(process.cwd(), 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupsDir, `backup-${timestamp}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf8');

    console.log(`\n🎉 اكتمل النسخ الاحتياطي بنجاح! الملف: ${backupFile}`);
  } catch (error: any) {
    console.error('❌ فشل النسخ الاحتياطي:', error.message);
  } finally {
    await pool.end();
  }
}

runBackup();
