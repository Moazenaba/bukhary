import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

async function runMigration() {
  console.log('🚀 Starting complete Supabase database schema upload and migration...');

  const connectionString =
    process.env.SUPABASE_URL ||
    (process.env.SUPABASE_DB_HOST
      ? `postgresql://${process.env.SUPABASE_DB_USER}:${encodeURIComponent(
          process.env.SUPABASE_DB_PASSWORD || ''
        )}@${process.env.SUPABASE_DB_HOST}:${process.env.SUPABASE_DB_PORT || '5432'}/postgres`
      : undefined);

  if (!connectionString) {
    console.error('❌ Error: Supabase connection credentials not found in environment variables.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  try {
    const client = await pool.connect();
    console.log('✅ Connected to Supabase PostgreSQL successfully!');

    const schemaPath = path.resolve(process.cwd(), 'supabase_schema.sql');
    if (!fs.existsSync(schemaPath)) {
      console.error(`❌ Error: Schema file not found at ${schemaPath}`);
      process.exit(1);
    }

    const sqlContent = fs.readFileSync(schemaPath, 'utf8');
    console.log(`📄 Read supabase_schema.sql (${sqlContent.length} bytes). Executing on Supabase...`);

    // Execute the complete schema
    await client.query(sqlContent);
    console.log('✨ Schema executed successfully!');

    // Query existing public tables to verify
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    const tableNames = tablesRes.rows.map((r) => r.table_name);
    console.log(`\n📊 Verified Public Tables in Supabase (${tableNames.length} tables):`);
    for (const t of tableNames) {
      try {
        const countRes = await client.query(`SELECT COUNT(*) as cnt FROM "${t}";`);
        console.log(`  - ${t}: ${countRes.rows[0].cnt} records`);
      } catch {
        console.log(`  - ${t}`);
      }
    }

    client.release();
    await pool.end();
    console.log('\n🎉 Complete Supabase database setup and upload finished successfully!');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Failed during schema upload to Supabase:', err);
    process.exit(1);
  }
}

runMigration();
