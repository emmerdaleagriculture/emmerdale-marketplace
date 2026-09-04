#!/usr/bin/env bash
#
# Move the live data from one Supabase project to another, logins intact.
#
# The schema is NOT copied — it is rebuilt on the new project from
# supabase/migrations (`supabase db push`), which is the repo's standing rule
# that the database is reconstructable from source alone. This script only
# carries the rows the migrations can't produce: the auth users (with their
# password hashes, so nobody has to reset anything), every public table, and
# the storage objects.
#
#   1. supabase db push            (new project: schema, RLS, cron, buckets)
#   2. ./scripts/migrate-supabase.sh dump
#   3. ./scripts/migrate-supabase.sh restore
#   4. ./scripts/migrate-supabase.sh storage
#   5. ./scripts/migrate-supabase.sh verify
#
# Steps 2-4 are safe to re-run: restore truncates before loading, and storage
# uploads with upsert. Step 3 is the only destructive one and it only ever
# touches the NEW project.
#
# Required environment (put them in a shell, not in a file):
#   OLD_DB_URL   postgres URL of the old project   — defaults to DATABASE_URL
#                from .env.local, rewritten to the session pooler (port 5432),
#                because pg_dump can't run through the transaction pooler.
#   NEW_DB_URL   postgres URL of the new project (also port 5432)
#   OLD_SUPABASE_URL / OLD_SERVICE_KEY   for the storage step
#   NEW_SUPABASE_URL / NEW_SERVICE_KEY   for the storage step
#
set -euo pipefail

cd "$(dirname "$0")/.."
OUT=migration-dump

# The transaction pooler (6543) can't serve pg_dump; the session pooler can.
default_old_db_url() {
  local u
  u=$(grep -m1 '^DATABASE_URL=' .env.local 2>/dev/null | cut -d= -f2- || true)
  echo "${u/:6543/:5432}"
}
OLD_DB_URL="${OLD_DB_URL:-$(default_old_db_url)}"

require() {
  for v in "$@"; do
    if [ -z "${!v:-}" ]; then echo "error: $v is not set" >&2; exit 1; fi
  done
}

# Every public table that exists on the given database, as a psql-ready list.
public_tables() {
  psql "$1" -X -At -c \
    "select string_agg(format('%I.%I', schemaname, tablename), ', ' order by tablename)
       from pg_tables where schemaname = 'public'"
}

cmd_dump() {
  require OLD_DB_URL
  mkdir -p "$OUT"

  # auth.users carries encrypted_password, so logins survive the move.
  # auth.identities is what links a user to the 'email' provider — without it
  # sign-in fails even though the user row is there.
  # Sessions and refresh tokens are deliberately NOT copied: the new project
  # signs JWTs with a different secret, so every existing session is void
  # regardless. Users are logged out once and log straight back in.
  echo "==> dumping auth (users, identities)"
  pg_dump "$OLD_DB_URL" --data-only --no-owner --no-privileges \
    --table=auth.users --table=auth.identities \
    --file="$OUT/auth.sql"

  # Everything in public, including the reference tables. The live project is
  # the source of truth — it holds rows that migrations and seed.sql never
  # produced (the notes slug rename, app_config tuning, the email queue).
  echo "==> dumping public"
  pg_dump "$OLD_DB_URL" --data-only --no-owner --no-privileges \
    --schema=public --file="$OUT/public.sql"

  # storage.objects rows are not dumped: re-uploading the files through the
  # storage API recreates them with ids and metadata the new project owns.
  echo "==> dumping storage manifest"
  psql "$OLD_DB_URL" -X -At -F$'\t' -c \
    "select bucket_id, name, coalesce(metadata->>'mimetype','application/octet-stream')
       from storage.objects order by bucket_id, name" > "$OUT/storage.tsv"

  wc -l < "$OUT/storage.tsv" | xargs printf '    %s storage objects\n'
  ls -la "$OUT"
}

cmd_restore() {
  require NEW_DB_URL
  [ -f "$OUT/public.sql" ] || { echo "error: run 'dump' first" >&2; exit 1; }

  local tables
  tables=$(public_tables "$NEW_DB_URL")
  [ -n "$tables" ] || { echo "error: no public tables on NEW_DB_URL — run 'supabase db push' first" >&2; exit 1; }

  echo "==> truncating and loading into the NEW project"
  echo "    tables: $tables"

  # session_replication_role = replica switches off FK and user triggers for
  # this session, so the load doesn't depend on table order and none of the
  # notify/audit triggers fire while historic rows land.
  # Everything runs in one transaction: a failure leaves the new project empty
  # rather than half-populated.
  psql "$NEW_DB_URL" -X -v ON_ERROR_STOP=1 --single-transaction \
    -c "set session_replication_role = replica" \
    -c "truncate table $tables restart identity cascade" \
    -c "truncate table auth.identities, auth.users cascade" \
    -f "$OUT/auth.sql" \
    -f "$OUT/public.sql"

  echo "==> done"
}

cmd_storage() {
  require OLD_SUPABASE_URL OLD_SERVICE_KEY NEW_SUPABASE_URL NEW_SERVICE_KEY
  [ -f "$OUT/storage.tsv" ] || { echo "error: run 'dump' first" >&2; exit 1; }

  mkdir -p "$OUT/files"
  while IFS=$'\t' read -r bucket path mime; do
    [ -n "$bucket" ] || continue
    local_file="$OUT/files/$bucket/$path"
    mkdir -p "$(dirname "$local_file")"

    echo "==> $bucket/$path"
    curl -fsS "$OLD_SUPABASE_URL/storage/v1/object/$bucket/$path" \
      -H "Authorization: Bearer $OLD_SERVICE_KEY" -o "$local_file"

    # x-upsert makes the step idempotent — re-running overwrites rather than
    # failing on "resource already exists".
    curl -fsS -X POST "$NEW_SUPABASE_URL/storage/v1/object/$bucket/$path" \
      -H "Authorization: Bearer $NEW_SERVICE_KEY" \
      -H "Content-Type: $mime" \
      -H "x-upsert: true" \
      --data-binary "@$local_file" > /dev/null
  done < "$OUT/storage.tsv"

  echo "==> uploaded $(wc -l < "$OUT/storage.tsv") objects"
}

cmd_verify() {
  require OLD_DB_URL NEW_DB_URL

  # Exact counts, not pg_stat estimates — the whole point is catching a table
  # that silently arrived short. query_to_xml runs a count per table without
  # having to assemble the union in bash.
  local q="select 'auth.users' t, count(*) n from auth.users
           union all select 'auth.identities', count(*) from auth.identities
           union all select 'storage.objects', count(*) from storage.objects
           union all
           select 'public.' || tablename,
                  (xpath('/row/c/text()',
                         query_to_xml(format('select count(*) as c from public.%I', tablename),
                                      false, true, '')))[1]::text::bigint
             from pg_tables where schemaname = 'public'"

  psql "$OLD_DB_URL" -X -At -F$'\t' -c "$q" | sort > "$OUT/counts.old"
  psql "$NEW_DB_URL" -X -At -F$'\t' -c "$q" | sort > "$OUT/counts.new"

  echo "==> row counts (old | new), differences marked"
  join -t$'\t' -a1 -a2 -e MISSING -o 0,1.2,2.2 "$OUT/counts.old" "$OUT/counts.new" \
    | awk -F'\t' '{ printf "%-34s %8s %8s %s\n", $1, $2, $3, ($2==$3 ? "" : "  <-- DIFFERS") }'
}

case "${1:-}" in
  dump)    cmd_dump ;;
  restore) cmd_restore ;;
  storage) cmd_storage ;;
  verify)  cmd_verify ;;
  *) sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
