# DIP TaskFlow — Site Engineer merge

## What changed

- React frontend (`frontend/`) with unified login
- **Site Engineer** department → `/site` (React portal from dip-projects)
- Everyone else → `/app` (existing TaskFlow UI in React shell)
- **Heads** (`users.is_head = true`) land on TaskFlow and get a **TaskFlow ↔ Site Engineer** toggle
- Single DB: TaskFlow Supabase; Site tables in `backend/sql/site_engineer_merge.sql`
- Site leave table is `site_leaves` (does not collide with TaskFlow `leaves`)

## Setup

1. Run SQL in TaskFlow Supabase: `backend/sql/site_engineer_merge.sql`
2. Copy anon key into `frontend/.env`:

```
VITE_API_BASE=/api
VITE_SUPABASE_URL=https://doqzerzcuppkksukhwvm.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

3. Mark heads:

```sql
update users set is_head = true where username = 'your.head.username';
```

4. Create Site Engineers via admin UI (department = `Site Engineer`, designation = site role) or SQL + bcrypt hash.

5. Dev:

```bash
# terminal 1
cd backend && npm run dev

# terminal 2
cd frontend && npm run dev
```

6. Production build:

```bash
cd frontend && npm run build   # copies into backend/public
cd backend && npm start
```

## Migrate data from dip-projects Supabase

Export/import tables (attendance, site_leaves←leaves, dpr_*, wpr_*, site_reports, …) and create matching `users` rows with bcrypt passwords (TaskFlow does not store plaintext passwords).
