# Backups

Every night at 02:17 UTC the `Backup` GitHub Actions workflow runs
`scripts/backup.sh`, which copies three things to the private Backblaze B2
bucket **`emmerdale`** (EU region, SSE-B2 encryption at rest, file lock on):

| In the bucket | What | History |
|---|---|---|
| `db/db-<stamp>.dump.age` | `pg_dump` custom-format archive of `public`, `auth`, `storage`, `cron`, `supabase_migrations` (schema + data), encrypted with age | one per night, dropped after 35 days by a bucket lifecycle rule |
| `storage/<bucket>/<path>` | every Supabase Storage object (job photos, message photos, notes media, contractor invoices), mirrored | replaced or removed files keep their previous version 30 days |
| `site/repo.bundle` | `git bundle --all` of this repository | previous versions kept 30 days |

Supabase's own daily backups still exist on the Supabase plan; this is the
off-site copy for the day Supabase, GitHub or the account holding them is the
thing that is gone.

Not backed up here, deliberately: environment variables and secrets (Vercel
env, Supabase function secrets, Stripe/Twilio/Resend keys). They are in the
Vercel and Supabase dashboards and in Tom's password manager.

## Keys

- **B2 `github-backup` key** (id `…000002`): restricted to the one bucket,
  list/read/write only. It cannot delete, so a leaked key cannot destroy
  history. Stored as the `B2_KEY_ID` / `B2_APP_KEY` repo secrets.
- **B2 master key** (id `…000001`): full account control. Not in GitHub.
  Password manager only. Used once to create the restricted key and the
  lifecycle rules.
- **age private key**: decrypts the `db/` files. **Not in GitHub, not on any
  server.** Tom's password manager only. The matching public key is the
  `BACKUP_AGE_RECIPIENT` default in `scripts/backup.sh`. If the private key
  is lost, every `db/` file is unreadable; storage and site copies are plain.

## Check it ran

GitHub → Actions → Backup. Each run prints the table count, object count and
bundle size, and fails if the dump is unreadable or the bucket's object count
does not match. Or from a shell with the rclone remote configured:

```bash
rclone lsl b2:emmerdale/db | tail -5
rclone size b2:emmerdale/storage
```

## Restore

Everything below needs `pg_dump`/`pg_restore` 17, `age`, `rclone`, and the
age private key saved as `age-key.txt`.

### Database

```bash
rclone copy b2:emmerdale/db/db-2026-10-13T0217Z.dump.age .
age --decrypt --identity age-key.txt --output db.dump db-2026-10-13T0217Z.dump.age
pg_restore --list db.dump | less          # see what's inside
```

**Into a fresh Supabase project** (the usual disaster case): build the schema
from source first, then load data only, triggers off, in one transaction —
this is the same shape as `scripts/migrate-supabase.sh restore`, which is how
the live project was populated on 2026-09-04.

```bash
supabase link --project-ref <new-ref> && supabase db push     # schema, RLS, cron, buckets
tables=$(psql "$NEW_DB_URL" -X -At -c "select string_agg(format('%I.%I', schemaname, tablename), ', ') from pg_tables where schemaname='public'")
pg_restore --data-only --no-owner --no-privileges \
  --schema=public \
  --table=auth.users --table=auth.identities \
  --file=restore.sql db.dump
psql "$NEW_DB_URL" -X -v ON_ERROR_STOP=1 --single-transaction \
  -c "set session_replication_role = replica" \
  -c "truncate table $tables restart identity cascade" \
  -c "truncate table auth.identities, auth.users cascade" \
  -f restore.sql
```

Only `auth.users` and `auth.identities` are restored from `auth`: sessions and
refresh tokens are signed with the old project's JWT secret and would be
void anyway. Everyone logs in once.

**A single table or row** (someone deleted the wrong thing): restore just that
table into a scratch schema and copy across.

```bash
pg_restore --data-only --no-owner --no-privileges --table=jobs --file=jobs.sql db.dump
```

### Storage objects

```bash
rclone copy b2:emmerdale/storage ./storage
```

Then re-upload through the Storage API with the service role key, exactly as
`scripts/migrate-supabase.sh storage` does (the `storage.objects` rows are
recreated by the upload; do not restore that table from the dump).

```bash
# per file: POST $SUPABASE_URL/storage/v1/object/<bucket>/<path> with
# Authorization: Bearer <service key>, x-upsert: true, --data-binary @file
```

### Site

```bash
rclone copy b2:emmerdale/site/repo.bundle .
git clone repo.bundle emmerdale-marketplace    # every branch and tag
```

Then `vercel link` + set the env vars from the password manager + deploy.
