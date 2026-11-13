#!/usr/bin/env bash
# Full encrypted backup of the production database (run by .github/workflows/backup.yml).
#
#   SOURCE_DATABASE_URL  connection string of the real database (GitHub secret, never printed)
#   BACKUP_PASSPHRASE    password that locks the backup file (GitHub secret, never printed)
#   VERIFY_DATABASE_URL  empty throwaway database the backup is restored into, to prove it works
#   OUT_DIR              where the encrypted file is written
#
# Produces OUT_DIR/bukhari-backup-<UTC time>.tar.gpg containing:
#   bukhari.dump   everything, restorable with pg_restore (all tables, exam PDFs, migrations)
#   csv/<table>.csv every table as CSV, readable in Excel
#   counts.txt      rows per table at backup time
# Exits non-zero (and the workflow fails, emailing the owner) if anything is missing or the
# restored copy differs from the source.
set -euo pipefail

: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL secret is not set}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE secret is not set}"
: "${VERIFY_DATABASE_URL:?VERIFY_DATABASE_URL is not set}"
OUT_DIR="${OUT_DIR:-backup-out}"
if [ "${#BACKUP_PASSPHRASE}" -lt 12 ]; then
  echo "BACKUP_PASSPHRASE must be at least 12 characters." >&2
  exit 1
fi

# The real database is reached over the internet: always encrypted.
case "$SOURCE_DATABASE_URL" in
  *sslmode=*|*@localhost*|*@127.0.0.1*) ;;
  *\?*) SOURCE_DATABASE_URL="$SOURCE_DATABASE_URL&sslmode=require" ;;
  *) SOURCE_DATABASE_URL="$SOURCE_DATABASE_URL?sslmode=require" ;;
esac

stamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/backup/csv" "$OUT_DIR"

echo "::group::Dump"
pg_dump --version
# Only the app's own data (schema "public": every table, exam PDFs, migrations). Supabase adds its
# own schemas and extensions (auth, storage, vault, ...) that every Supabase project already has
# and that cannot be restored anywhere else, so they are left out; so are backup_* copies made
# from the SQL Editor (docs/sql), which are copies of these same tables.
pg_dump --format=custom --no-owner --no-privileges --schema=public --dbname="$SOURCE_DATABASE_URL" --file="$work/backup/bukhari.dump"
echo "dump size: $(du -h "$work/backup/bukhari.dump" | cut -f1)"
echo "::endgroup::"

# Exact row count of every table, from the same database.
count_sql="SELECT c.relname || '=' || (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text
           FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
           WHERE s.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname;"
psql "$SOURCE_DATABASE_URL" -X -At -c "$count_sql" > "$work/backup/counts.txt"
tables=$(cut -d= -f1 "$work/backup/counts.txt")
[ -n "$tables" ] || { echo "No tables found in the source database." >&2; exit 1; }
grep -q '^committees=' "$work/backup/counts.txt" || { echo "The committees table is missing: wrong database?" >&2; exit 1; }
echo "tables: $(echo "$tables" | wc -l)"; cat "$work/backup/counts.txt"

echo "::group::CSV copy of every table"
for t in $tables; do
  psql "$SOURCE_DATABASE_URL" -X -q -c "\\copy (SELECT * FROM public.\"$t\") TO '$work/backup/csv/$t.csv' WITH (FORMAT csv, HEADER true)"
  # UTF-8 mark first, so Excel shows the Arabic text correctly.
  { printf '\xEF\xBB\xBF'; cat "$work/backup/csv/$t.csv"; } > "$work/backup/csv/$t.tmp" && mv "$work/backup/csv/$t.tmp" "$work/backup/csv/$t.csv"
done
echo "::endgroup::"

echo "::group::Restore into a throwaway database and compare"
# Every database already has a "public" schema: skip creating it (and its comment), restore the rest.
pg_restore --list "$work/backup/bukhari.dump" | grep -vE ' (SCHEMA|COMMENT) - (SCHEMA )?public( |$)' > "$work/restore.list"
pg_restore --no-owner --no-privileges --exit-on-error --use-list="$work/restore.list" --dbname="$VERIFY_DATABASE_URL" "$work/backup/bukhari.dump"
psql "$VERIFY_DATABASE_URL" -X -At -c "$count_sql" > "$work/restored-counts.txt"
if ! diff -u "$work/backup/counts.txt" "$work/restored-counts.txt"; then
  echo "The restored copy does not match the source (counts above). The backup is NOT trustworthy." >&2
  exit 1
fi
echo "Restored copy matches the source in every table."
echo "::endgroup::"

echo "::group::Encrypt"
tar -C "$work/backup" -cf "$work/backup.tar" .
out="$OUT_DIR/bukhari-backup-$stamp.tar.gpg"
printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 0 \
  --symmetric --cipher-algo AES256 --output "$out" "$work/backup.tar"
# Prove the file opens with the passphrase before calling it done.
printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 0 --decrypt "$out" | tar -t >/dev/null
echo "encrypted backup: $out ($(du -h "$out" | cut -f1))"
echo "::endgroup::"
