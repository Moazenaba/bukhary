// Full database backup as one SQLite .db file (admins only, server action 'database.backup').
// The server sends each table in pages (GET /api/database/backup/rows); the file is assembled
// here with sql.js, because one response holding the whole database would exceed the host's limit.
// The file holds everything, password hashes and personal data included: keep it somewhere safe.
import { api } from './api';

interface BackupColumn {
  name: string;
  type: string;
}
interface BackupTable {
  name: string;
  columns: BackupColumn[];
  estimatedRows: number;
}
type Cell = string | number | null | { b64: string };

/** Rows per request: files go one at a time so each response stays small. */
const pageSize = (table: BackupTable) =>
  table.columns.some((c) => c.type === 'bytea') ? 1 : 500;

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

function sqliteType(pgType: string): string {
  if (pgType === 'bytea') return 'BLOB';
  if (/int|serial/.test(pgType)) return 'INTEGER';
  if (/numeric|real|double|decimal/.test(pgType)) return 'REAL';
  if (pgType === 'boolean') return 'INTEGER';
  return 'TEXT';
}

function toBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Builds the backup and saves it as `bukhari-backup-<date>.db`. `onProgress` gets the table being
 * copied and how many tables are done.
 */
export async function downloadFullBackup(onProgress: (table: string, done: number, total: number) => void): Promise<void> {
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
    import('sql.js'),
    import('sql.js/dist/sql-wasm.wasm?url'),
  ]);
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new SQL.Database();
  try {
    const { tables } = await api<{ tables: BackupTable[] }>('/database/backup/tables');
    db.run('BEGIN;');
    for (let t = 0; t < tables.length; t++) {
      const table = tables[t];
      onProgress(table.name, t, tables.length);
      const cols = table.columns.map((c) => `${quote(c.name)} ${sqliteType(c.type)}`).join(', ');
      db.run(`CREATE TABLE ${quote(table.name)} (${cols});`);
      const insert = db.prepare(
        `INSERT INTO ${quote(table.name)} VALUES (${table.columns.map(() => '?').join(', ')});`
      );
      const limit = pageSize(table);
      for (let offset = 0; ; offset += limit) {
        const { rows } = await api<{ rows: Cell[][] }>(
          `/database/backup/rows?table=${encodeURIComponent(table.name)}&offset=${offset}&limit=${limit}`
        );
        for (const row of rows) {
          insert.run(row.map((v) => (v !== null && typeof v === 'object' ? toBytes(v.b64) : v)));
        }
        if (rows.length < limit) break;
      }
      insert.free();
    }
    // Where the copy came from and when, inside the file itself.
    db.run('CREATE TABLE "_backup_info" ("key" TEXT, "value" TEXT);');
    db.run('INSERT INTO "_backup_info" VALUES (?, ?), (?, ?);', [
      'created_at', new Date().toISOString(),
      'tables', String(tables.length),
    ]);
    db.run('COMMIT;');
    onProgress('', tables.length, tables.length);

    const blob = new Blob([db.export() as Uint8Array<ArrayBuffer>], { type: 'application/vnd.sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bukhari-backup-${new Date().toISOString().slice(0, 10)}.db`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } finally {
    db.close();
  }
}
