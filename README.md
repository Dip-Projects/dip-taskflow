# DIP Projects — Task Manager

Two folders:
- `backend/` — Node/Express API, backed by Supabase (Postgres + file storage)
- `frontend/` — plain HTML/CSS/JS, mobile-friendly already, no build step

How it works: admin logs in and assigns tasks to employees (department,
project, task type, description, hours, deadline, priority, optional
attachment/voice note). Each employee only ever sees their own tasks under
**My Tasks**. The admin additionally has **All Delegated Tasks**, a
read-only reference view of everyone's tasks with filters by department,
employee and status — matching the screenshots you shared.

## 1. Supabase setup

1. Create a project at supabase.com (or use your existing one — your
   uploaded `.env` already points at `doqzerzcuppkksukhwvm.supabase.co`).
2. Open **SQL Editor → New query**, paste in the contents of
   `backend/sql/schema.sql`, and run it. This creates the `users`,
   `departments`, `projects`, `task_types`, `tasks` tables and a public
   `task-files` storage bucket for attachments/voice notes.

⚠️ **Security note:** the `.env.example` file you originally uploaded had
your real `SUPABASE_SERVICE_ROLE_KEY` written directly into it instead of a
placeholder. That key has full admin access to your database, bypassing all
permissions. If that file was ever pushed to GitHub or shared anywhere,
go to **Supabase → Settings → API** and regenerate (roll) that key now,
then update `backend/.env` with the new one. I've put your real key only in
`backend/.env` (which is git-ignored) and replaced `.env.example` with
placeholders, so going forward only the real `.env` ever holds secrets.

## 2. Backend setup

```bash
cd backend
npm install
npm run seed          # creates starter departments/projects/task types
                       # + admin (admin / Admin@123)
                       # + employee (charmy / Charmy@123)
                       # + HR (hr / Hr@123) → /hr portal
npm start              # → http://localhost:4000
```

Change those two default passwords after your first login (there's no
"change password" screen yet — easiest is to delete the row in the
Supabase `users` table and recreate it with `npm run add-employee`, see
below).

**Add real employees** — there's no "manage employees" screen, so use the
helper script instead:

```bash
npm run add-employee jay "Jay@123" "Jay Patel"
npm run add-employee nisarg "Nisarg@123" "Nisarg Pandya" admin   # add "admin" to make them an admin
```

**Deploying the backend** (Render, Railway, Fly.io, etc.): push the
`backend/` folder, set the three env vars from `.env` in your host's
dashboard (don't upload `.env` itself), and the start command is `npm
start`. The server now listens on all interfaces so hosts can reach it
(your original file had it bound to `127.0.0.1`, which only works for
local-machine testing).

## 3. Frontend setup

Nothing to build — `frontend/index.html` is the app. For local testing,
just open it in a browser, or serve the folder:

```bash
cd frontend
npx serve .
```

Before deploying, edit the top of `frontend/app.js`:

```js
const API_BASE = 'http://localhost:4000/api';
```

and point it at your deployed backend, e.g.
`https://your-app.onrender.com/api`.

Host the `frontend/` folder anywhere static (Netlify, Vercel, GitHub
Pages, or even Supabase Storage as a public bucket). It already has a
responsive layout (single-column forms, scrollable tab bar) for phones.

## API reference (for your own notes)

| Method | Path                      | Who          | Purpose                          |
|--------|---------------------------|--------------|-----------------------------------|
| POST   | /api/auth/login           | anyone       | log in, returns JWT + user        |
| GET    | /api/master/departments   | logged in    | dropdown data                     |
| GET    | /api/master/projects      | logged in    | dropdown data                     |
| GET    | /api/master/task-types    | logged in    | dropdown data                     |
| GET    | /api/master/employees     | logged in    | dropdown data + employee filter   |
| POST   | /api/tasks                | admin        | create + assign a task            |
| GET    | /api/tasks/all             | admin        | every task, with filters          |
| GET    | /api/tasks/my              | logged in    | only the caller's own tasks       |
| PATCH  | /api/tasks/:id/status      | owner/admin  | start / complete / reject / reopen|
