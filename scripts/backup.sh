#!/usr/bin/env bash
#
# Off-site backup of the live system to Backblaze B2. Runs nightly from
# .github/workflows/backup.yml; can also be run by hand. See docs/backups.md
# for what lands where and how to restore.
#
# Three things go up, under bucket "$B2_BUCKET":
#   db/db-<stamp>.dump.age   pg_dump custom-format archive of public, auth,
#                            storage, cron and supabase_migrations — schema and
#                            data — encrypted with age to the public key below.
#                            A new dated file every run; B2 lifecycle rules on
#                            the bucket drop them after 35 days.
#   storage/<bucket>/<path>  every Supabase Storage object, mirrored with
#                            rclone sync --checksum (unchanged files are not
#                            re-uploaded; replaced ones keep their old version
#                            30 days via lifecycle rules).
#   site/repo.bundle         git bundle of every ref in this repo. Fixed name,
#                            so B2's file versioning keeps 30 days of history.
#
# The dump holds customer PII and password hashes, so it is encrypted BEFORE
# it leaves the runner. Only the public key is here; the private key is NOT
# in GitHub secrets. It lives in Tom's password manager. Lose it and the db/
# files are unreadable — the storage/ and site/ copies are plain.
#
# Required environment:
#   DATABASE_URL                  session pooler URL (port 5432 — pg_dump can't
#                                 use the transaction pooler on 6543)
#   SUPABASE_URL                  https://<ref>.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY     to download private-bucket objects
#   B2_KEY_ID / B2_APP_KEY        the restricted "github-backup" key: list,
#                                 read, write on the one bucket; it cannot
#                                 delete, so a leaked key can't wipe history
# Optional:
#   B2_BUCKET                     default "emmerdale"
#   BACKUP_AGE_RECIPIENT          override the public key
#   BACKUP_SKIP_SITE=1            skip the git bundle (no checkout available)
#
set -euo pipefail

B2_BUCKET="${B2_BUCKET:-emmerdale}"
BACKUP_AGE_RECIPIENT="${BACKUP_AGE_RECIPIENT:-age13ffgw3laexljeugu6z0vf3ha4gtzsuth4yj5zp7tn8kw9hdkdfsqanp026}"

for v in DATABASE_URL SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY B2_KEY_ID B2_APP_KEY; do
  [ -n "${!v:-}" ] || { echo "error: $v is not set" >&2; exit 1; }
done
for bin in pg_dump pg_restore psql age rclone curl; do
  command -v "$bin" >/dev/null || { echo "error: $bin not installed" >&2; exit 1; }
done

# rclone reads its remote from the environment — no config file to write.
export RCLONE_CONFIG_B2_TYPE=b2
export RCLONE_CONFIG_B2_ACCOUNT="$B2_KEY_ID"
export RCLONE_CONFIG_B2_KEY="$B2_APP_KEY"

# The transaction pooler can't serve pg_dump; silently fix a pasted 6543 URL.
DATABASE_URL="${DATABASE_URL/:6543/:5432}"

STAMP=$(date -u +%Y-%m-%dT%H%MZ)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
cd "$(dirname "$0")/.."

# ─── 1. database ───────────────────────────────────────────────────────────
echo "==> pg_dump"
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges \
  --schema=public --schema=auth --schema=storage --schema=cron \
  --schema=supabase_migrations --file="$WORK/db.dump"

# A dump that pg_restore can't read, or that has lost its tables, must fail
# the run rather than quietly overwrite good history.
tables=$(pg_restore --list "$WORK/db.dump" | grep -c 'TABLE DATA public' || true)
expected=$(psql "$DATABASE_URL" -X -At -c "select count(*) from pg_tables where schemaname = 'public'")
[ "$tables" -eq "$expected" ] || { echo "error: dump lists $tables public tables, live database has $expected" >&2; exit 1; }
echo "    $tables public tables, $(du -h "$WORK/db.dump" | cut -f1)"

age --recipient "$BACKUP_AGE_RECIPIENT" --output "$WORK/db-$STAMP.dump.age" "$WORK/db.dump"
rm "$WORK/db.dump"

# ─── 2. storage objects ────────────────────────────────────────────────────
echo "==> storage"
mkdir -p "$WORK/storage"
psql "$DATABASE_URL" -X -At -F$'\t' -c \
  "select bucket_id, name from storage.objects where name not like '%/' order by 1, 2" \
  > "$WORK/storage.tsv"

n=0
while IFS=$'\t' read -r bucket path; do
  [ -n "$bucket" ] || continue
  mkdir -p "$WORK/storage/$bucket/$(dirname "$path")"
  # --retry handles the odd 5xx; a persistent failure still aborts the run.
  curl -fsS --retry 3 --retry-all-errors \
    "$SUPABASE_URL/storage/v1/object/$bucket/$path" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -o "$WORK/storage/$bucket/$path"
  n=$((n + 1))
done < "$WORK/storage.tsv"
echo "    $n objects, $(du -sh "$WORK/storage" | cut -f1)"

# ─── 3. site ───────────────────────────────────────────────────────────────
if [ "${BACKUP_SKIP_SITE:-}" != "1" ]; then
  echo "==> git bundle"
  git bundle create "$WORK/repo.bundle" --all >/dev/null 2>&1
  git bundle verify "$WORK/repo.bundle" >/dev/null 2>&1
  echo "    $(du -h "$WORK/repo.bundle" | cut -f1)"
fi

# ─── 4. upload ─────────────────────────────────────────────────────────────
echo "==> upload to b2:$B2_BUCKET"
rclone copyto "$WORK/db-$STAMP.dump.age" "b2:$B2_BUCKET/db/db-$STAMP.dump.age"
# --checksum: freshly downloaded files have today's mtime, so compare by SHA1
# and only ship what actually changed. Removed objects are hidden in B2, not
# destroyed — the lifecycle rule deletes them 30 days later.
rclone sync "$WORK/storage" "b2:$B2_BUCKET/storage" --checksum --stats-one-line -v 2>&1 | tail -3
if [ -f "$WORK/repo.bundle" ]; then
  rclone copyto "$WORK/repo.bundle" "b2:$B2_BUCKET/site/repo.bundle"
fi

# ─── 5. verify what's there ────────────────────────────────────────────────
echo "==> verify"
rclone lsl "b2:$B2_BUCKET/db/db-$STAMP.dump.age" | grep -q . || { echo "error: dump not found in bucket" >&2; exit 1; }
remote_n=$(rclone lsf -R --files-only "b2:$B2_BUCKET/storage" | wc -l)
[ "$remote_n" -eq "$n" ] || { echo "error: bucket has $remote_n storage files, expected $n" >&2; exit 1; }
echo "    db/db-$STAMP.dump.age uploaded; storage/ holds $remote_n objects"
echo "==> done"
