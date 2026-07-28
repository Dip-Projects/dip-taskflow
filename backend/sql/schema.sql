-- =====================================================================
-- TaskFlow / DIP Projects schema
-- Run this whole file once in Supabase → SQL Editor → New query → Run.
-- (Fresh install schema — includes verification, tickets, and corrections.)
-- =====================================================================

create extension if not exists pgcrypto;

-- ============ USERS (login + role) ============
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  full_name text not null,
  department text,
  designation text,
  role text not null check (role in ('admin', 'employee', 'head')),
  is_active boolean not null default true,
  can_verify boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============ MASTER DATA (used to fill dropdowns) ============
create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  client_name text,
  project_type text,
  location text,
  start_date date,
  expected_end_date date,
  status text default 'Planning',
  description text,
  created_at timestamptz not null default now(),
  team_leader_id uuid references users(id),
  coordinator_id uuid references users(id),
  site_incharge_id uuid references users(id)
);

create table if not exists task_types (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

-- Default checkpoint template per task type. When an admin picks a Task Type
-- while creating/editing a recurring task, these labels are pre-filled into
-- the checkpoints list (still editable per-task). Saving a recurring task
-- with a task_type_id upserts this template with whatever checkpoints were
-- used, so the template always reflects the most recently used set.
create table if not exists task_type_checkpoint_templates (
  id uuid primary key default gen_random_uuid(),
  task_type_id uuid not null references task_types(id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_tt_checkpoint_templates_type
  on task_type_checkpoint_templates(task_type_id);

-- ============ TASKS ============
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references departments(id),
  project_id uuid references projects(id),
  task_type_id uuid references task_types(id),
  assigned_to uuid not null references users(id) on delete cascade,
  assigned_by uuid not null references users(id),
  description text not null,
  hours_to_complete numeric,
  target_date timestamptz not null,
  priority text not null default 'Medium' check (priority in ('Low', 'Medium', 'High')),
  rescheduling_possible boolean not null default false,
  attachment_url text,
  voice_note_url text,
  status text not null default 'Pending' check (status in ('Pending', 'In Progress', 'Completed', 'Rejected')),
  status_note text,
  accepted_at timestamptz,
  rejected_at timestamptz,
  verifier_id uuid references users(id),
  verification_status text check (verification_status in ('Pending Verification', 'Verified', 'Verification Rejected')),
  verification_note text,
  verification_attachment_urls text[],
  correction_voice_url text,
  created_at timestamptz not null default now()
);

-- Postgres auto-names these constraints "tasks_assigned_to_fkey",
-- "tasks_assigned_by_fkey" and "tasks_verifier_id_fkey" — the backend's
-- nested-select query (routes/tasks.js → TASK_SELECT) relies on exactly
-- those names, so don't rename them.

create index if not exists idx_tasks_assigned_to on tasks(assigned_to);
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_verification_status on tasks(verification_status);

-- ============ RECURRING TASKS ============
-- A recurring task is a template (e.g. "Daily site safety check") that
-- fires on a schedule. Each fire date gets one "instance" row, and each
-- instance tracks which checkpoints have been ticked.

create table if not exists recurring_tasks (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references departments(id),
  project_id uuid references projects(id),
  task_type_id uuid references task_types(id),
  assigned_to uuid not null references users(id) on delete cascade,
  assigned_by uuid not null references users(id),
  description text not null,
  priority text not null default 'Medium' check (priority in ('Low', 'Medium', 'High')),
  frequency text not null check (frequency in ('Daily', 'Weekly', 'Monthly', 'Yearly')),
  frequency_days text, -- comma-separated day numbers (0=Sun..6=Sat), only used for Weekly
  start_date date not null,
  end_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Postgres auto-names these "recurring_tasks_assigned_to_fkey" and
-- "recurring_tasks_assigned_by_fkey" — routes/recurring_tasks.js (RT_SELECT)
-- relies on exactly those names, so don't rename them.

create index if not exists idx_recurring_tasks_assigned_to on recurring_tasks(assigned_to);
create index if not exists idx_recurring_tasks_active on recurring_tasks(is_active);

-- Checkpoints that belong to one specific recurring task (the list shown
-- in the create/edit modal and saved with that task).
create table if not exists recurring_task_checkpoints (
  id uuid primary key default gen_random_uuid(),
  recurring_task_id uuid not null references recurring_tasks(id) on delete cascade,
  label text not null,
  sort_order int not null default 0
);

create index if not exists idx_recurring_task_checkpoints_task
  on recurring_task_checkpoints(recurring_task_id);

-- One row per (recurring_task, due_date) — created on demand the first
-- time an employee opens "My recurring tasks" on a day it's due.
create table if not exists recurring_task_instances (
  id uuid primary key default gen_random_uuid(),
  recurring_task_id uuid not null references recurring_tasks(id) on delete cascade,
  due_date date not null,
  status text not null default 'Pending' check (status in ('Pending', 'Completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recurring_task_id, due_date)
);

create index if not exists idx_recurring_task_instances_task
  on recurring_task_instances(recurring_task_id);

-- Which checkpoints have been ticked for a given instance.
create table if not exists recurring_task_checkpoint_completions (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references recurring_task_instances(id) on delete cascade,
  checkpoint_id uuid not null references recurring_task_checkpoints(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (instance_id, checkpoint_id)
);

create index if not exists idx_rt_checkpoint_completions_instance
  on recurring_task_checkpoint_completions(instance_id);

-- ============ TICKETS ============
create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete set null,
  raised_by uuid not null references users(id),
  description text not null,
  status text not null default 'Open' check (status in ('Open', 'Resolved')),
  created_at timestamptz not null default now()
);

-- ============ STORAGE BUCKET (for attachments + voice notes) ============
-- Public bucket so the file links the frontend renders just work.
insert into storage.buckets (id, name, public)
values ('task-files', 'task-files', true)
on conflict (id) do nothing;

-- ============ ROW LEVEL SECURITY ============
alter table users enable row level security;
alter table departments enable row level security;
alter table projects enable row level security;
alter table task_types enable row level security;
alter table tasks enable row level security;
alter table tickets enable row level security;
alter table recurring_tasks enable row level security;
alter table recurring_task_checkpoints enable row level security;
alter table recurring_task_instances enable row level security;
alter table recurring_task_checkpoint_completions enable row level security;
alter table task_type_checkpoint_templates enable row level security;

-- These tables are only ever touched through the Express backend (which
-- already enforces requireAuth/requireAdmin in code), so RLS here just
-- needs to allow that access through rather than re-implement per-row
-- rules. If your supabaseClient.js uses the service_role key, these
-- policies are redundant (service_role bypasses RLS) but harmless.
drop policy if exists "backend full access" on recurring_tasks;
create policy "backend full access" on recurring_tasks for all using (true) with check (true);

drop policy if exists "backend full access" on recurring_task_checkpoints;
create policy "backend full access" on recurring_task_checkpoints for all using (true) with check (true);

drop policy if exists "backend full access" on recurring_task_instances;
create policy "backend full access" on recurring_task_instances for all using (true) with check (true);

drop policy if exists "backend full access" on recurring_task_checkpoint_completions;
create policy "backend full access" on recurring_task_checkpoint_completions for all using (true) with check (true);

drop policy if exists "backend full access" on task_type_checkpoint_templates;
create policy "backend full access" on task_type_checkpoint_templates for all using (true) with check (true);


-- =====================================================================
-- MIGRATION (run these on existing databases that already have tasks table)
-- In Supabase → SQL Editor → New query → paste and run one at a time
-- =====================================================================

-- ALTER TABLE tasks ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
-- ALTER TABLE tasks ADD COLUMN IF NOT EXISTS rejected_at timestamptz;
-- ALTER TABLE tasks ADD COLUMN IF NOT EXISTS verification_attachment_urls text[];
-- ALTER TABLE tasks ADD COLUMN IF NOT EXISTS correction_voice_url text;

-- If you already had recurring tasks working before and only need to add
-- the checkpoint-template table, run just this part:
--
-- create table if not exists task_type_checkpoint_templates (
--   id uuid primary key default gen_random_uuid(),
--   task_type_id uuid not null references task_types(id) on delete cascade,
--   label text not null,
--   sort_order int not null default 0,
--   created_at timestamptz not null default now()
-- );
-- create index if not exists idx_tt_checkpoint_templates_type
--   on task_type_checkpoint_templates(task_type_id);
-- alter table task_type_checkpoint_templates enable row level security;
