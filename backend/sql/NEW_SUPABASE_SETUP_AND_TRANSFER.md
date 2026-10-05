# New Supabase project — tables + data transfer

## A) Tables (structure)

1. Create a **new** Supabase project under `admin@dipprojects.com`.
2. Open **SQL Editor → New query**.
3. Paste and run: `backend/sql/full_new_supabase_setup.sql`  
   (If it times out, run sections 1→16 one file at a time in the same order listed inside that file.)
4. **Storage**: create buckets the app uses (same names as old project), e.g. site files / attachments — check old project **Storage** and recreate empty buckets, then copy files (step C).

## B) Data transfer (rows)

### Option 1 — Recommended (Supabase dashboard)

On the **OLD** project (`patildivyanka11` / current TaskFlow DB):

1. **Project Settings → Database → Connection string** (URI) — keep ready.
2. Or use **Database → Backups** if available on your plan.

Easiest no-CLI path for important tables:

1. Old project → **Table Editor** → each table → **Export** (CSV)  
   Priority tables:  
   `users`, `departments`, `projects`, `task_types`, `tasks`, `recurring_tasks`,  
   `leaves`, `tickets`, `attendance`, `dpr_*`, `wpr_*`, `site_*`,  
   `material_requirements`, `drawings` (if any), then bot tables if already used.
2. New project → **Table Editor** → **Import** CSV into the same table names.  
   **Import order:** master first (`departments`, `projects`, `task_types`, `users`) → then `tasks` / `leaves` / etc. (FK order).

### Option 2 — pg_dump / psql (full copy)

Need **Database password** from both projects (Settings → Database).

```bash
# Dump DATA ONLY from OLD (replace URI)
pg_dump "postgresql://postgres.[OLD_REF]:[PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres" \
  --data-only --no-owner --no-acl -F p -f dip_data.sql

# Load into NEW (schema already created via full_new_supabase_setup.sql)
psql "postgresql://postgres.[NEW_REF]:[PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres" \
  -f dip_data.sql
```

If FK errors appear, temporarily:

```sql
SET session_replication_role = replica;
-- run inserts / dip_data.sql
SET session_replication_role = DEFAULT;
```

### Option 3 — Supabase “Transfer project”

If you only need ownership change (same DB, no copy):

**Old project → Settings → General → Transfer project** → org of `admin@dipprojects.com`.

Then you do **not** need CSV dump — same URL/keys keep working after transfer.

## C) Storage files

1. Old **Storage** → download folders / use a sync tool.
2. New **Storage** → create same bucket names → upload files.
3. If public URLs change, update rows that store `attachment_url` / image paths (or keep same project via Transfer).

## D) Point the app at the new DB

Update:

- `backend/.env` → `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- `frontend/.env` → `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Vercel env (Dip-Projects / dip-taskflow project) → same keys
- Redeploy

## E) GitHub

| Remote | URL | Latest bot commit |
|--------|-----|-------------------|
| `dip` | https://github.com/Dip-Projects/dip-taskflow | Yes (`6c420b9`) |
| `origin` | https://github.com/DivyankaOp/dip-taskflow | Push may need DivyankaOp login (403 with Dip-Projects account) |
