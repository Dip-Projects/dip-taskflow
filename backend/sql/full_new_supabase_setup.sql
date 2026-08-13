-- =====================================================================
-- DIP TaskFlow — FULL fresh Supabase setup (new project)
-- Run in NEW Supabase → SQL Editor (may need multiple runs if timeout).
-- Order: core schema → site portal → leave/buddy → permissions → bot
-- =====================================================================

-- ##### 1) schema.sql #####
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
  role text not null check (role in ('admin', 'employee', 'head', 'client')),
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

-- ##### 2) site_engineer_merge.sql #####
-- =====================================================================
-- Site Engineer merge into DIP TaskFlow Supabase
-- Run in Supabase SQL Editor on the TaskFlow project (doqzerzcuppkksukhwvm).
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE where possible.
-- =====================================================================

-- ---- Extend users for Site Engineer + Head toggle ----
alter table users add column if not exists is_head boolean not null default false;
alter table users add column if not exists site_name text;
alter table users add column if not exists site_names jsonb;
-- designation already exists; Site job title (Site Engineer / Site Incharge / …) lives there

-- Department master row
insert into departments (name)
values ('Site Engineer')
on conflict (name) do nothing;

-- Compatibility view so Site React code can keep querying site_user_details
create or replace view site_user_details as
select
  u.id,
  u.username,
  u.full_name as name,
  u.department,
  coalesce(nullif(trim(u.designation), ''), u.role) as role,
  case when u.is_active then 'Active' else 'Inactive' end as status,
  u.site_name,
  u.site_names,
  u.created_at,
  u.is_head,
  -- password never exposed; Site UI uses JWT login from TaskFlow API
  null::text as password
from users u;

-- ---- Site attendance (clock in/out) ----
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  user_name text not null,
  date date not null,
  clock_in timestamptz,
  clock_out timestamptz,
  status text,
  clock_in_image text,
  clock_out_image text,
  clock_in_location text,
  clock_out_location text,
  clock_in_status text,
  clock_out_status text,
  created_at timestamptz not null default now(),
  unique (user_name, date)
);

create index if not exists idx_attendance_user_date on attendance (user_name, date);

-- ---- Site leaves (separate from TaskFlow `leaves`) ----
create table if not exists site_leaves (
  id uuid primary key default gen_random_uuid(),
  user_name text not null,
  name text,
  leave_type text,
  from_date date not null,
  to_date date not null,
  reason text,
  site_name text,
  level_approver_user_name text,
  level_approver_name text,
  level_approver_role text,
  level_approved boolean,
  head_approver_user_name text,
  head_approver_name text,
  head_approver_role text,
  head_approved boolean,
  status text default 'pending',
  rejection_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_site_leaves_user on site_leaves (user_name);
create index if not exists idx_site_leaves_approvers on site_leaves (level_approver_user_name, head_approver_user_name);

create table if not exists leave_seen_status (
  user_name text primary key,
  snapshot jsonb,
  updated_at timestamptz not null default now()
);

-- ---- Reports ----
create table if not exists dpr_reports (
  id uuid primary key default gen_random_uuid(),
  site text,
  engineer text,
  report_type text,
  date date,
  payload jsonb,
  pdf_url text,
  photo_folder text,
  created_at timestamptz not null default now()
);

create table if not exists dpr_drafts (
  id uuid primary key default gen_random_uuid(),
  site text,
  engineer text,
  report_type text,
  date date,
  payload jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists wpr_reports (
  id uuid primary key default gen_random_uuid(),
  site_name text,
  engineer_name text,
  report_date date,
  report_number text,
  payload jsonb,
  submitted_by text,
  created_at timestamptz not null default now()
);

create table if not exists wpr_drafts (
  id uuid primary key default gen_random_uuid(),
  site_name text,
  engineer_name text,
  payload jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists wpr_images (
  id uuid primary key default gen_random_uuid(),
  report_id uuid,
  url text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create table if not exists site_reports (
  id uuid primary key default gen_random_uuid(),
  site_name text,
  visit_date date,
  submitted_by text,
  submitted_by_name text,
  payload jsonb,
  pdf_url text,
  created_at timestamptz not null default now()
);

create table if not exists svr_drafts (
  id uuid primary key default gen_random_uuid(),
  site_name text,
  submitted_by text,
  payload jsonb,
  updated_at timestamptz not null default now()
);

-- Supporting master / lookup tables used by DPR
create table if not exists manpower (
  id uuid primary key default gen_random_uuid(),
  name text,
  meta jsonb
);

create table if not exists man_type (
  id uuid primary key default gen_random_uuid(),
  name text unique
);

create table if not exists workcategory (
  id uuid primary key default gen_random_uuid(),
  name text unique
);

create table if not exists dpr_equipment (
  id uuid primary key default gen_random_uuid(),
  name text,
  meta jsonb
);

create table if not exists material_requirements (
  id uuid primary key default gen_random_uuid(),
  site text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists user_site_assignments (
  id uuid primary key default gen_random_uuid(),
  user_name text,
  site_name text,
  unique (user_name, site_name)
);

create table if not exists site_details (
  id uuid primary key default gen_random_uuid(),
  site_name text unique,
  meta jsonb
);

-- Optional tables referenced by clock-out task flow in Clockinout.jsx
create table if not exists checkpoints (
  id uuid primary key default gen_random_uuid(),
  task_id uuid,
  label text,
  meta jsonb
);

create table if not exists task_submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid,
  user_name text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_name text,
  url text,
  meta jsonb,
  created_at timestamptz not null default now()
);

-- ---- Permissive RLS for anon key (matches how dip-projects talked to Supabase).
-- Tighten later with proper auth if needed.
alter table attendance enable row level security;
alter table site_leaves enable row level security;
alter table leave_seen_status enable row level security;
alter table dpr_reports enable row level security;
alter table dpr_drafts enable row level security;
alter table wpr_reports enable row level security;
alter table wpr_drafts enable row level security;
alter table wpr_images enable row level security;
alter table site_reports enable row level security;
alter table svr_drafts enable row level security;

do $$
begin
  -- Helper: create open policies if missing
  perform 1;
exception when others then null;
end $$;

-- Open policies (drop/recreate for idempotency on common tables)
drop policy if exists "site_attendance_all" on attendance;
create policy "site_attendance_all" on attendance for all using (true) with check (true);

drop policy if exists "site_leaves_all" on site_leaves;
create policy "site_leaves_all" on site_leaves for all using (true) with check (true);

drop policy if exists "leave_seen_all" on leave_seen_status;
create policy "leave_seen_all" on leave_seen_status for all using (true) with check (true);

drop policy if exists "dpr_reports_all" on dpr_reports;
create policy "dpr_reports_all" on dpr_reports for all using (true) with check (true);

drop policy if exists "dpr_drafts_all" on dpr_drafts;
create policy "dpr_drafts_all" on dpr_drafts for all using (true) with check (true);

drop policy if exists "wpr_reports_all" on wpr_reports;
create policy "wpr_reports_all" on wpr_reports for all using (true) with check (true);

drop policy if exists "wpr_drafts_all" on wpr_drafts;
create policy "wpr_drafts_all" on wpr_drafts for all using (true) with check (true);

drop policy if exists "site_reports_all" on site_reports;
create policy "site_reports_all" on site_reports for all using (true) with check (true);

drop policy if exists "svr_drafts_all" on svr_drafts;
create policy "svr_drafts_all" on svr_drafts for all using (true) with check (true);

-- Grant view access
grant select on site_user_details to anon, authenticated;
grant select, insert, update, delete on attendance to anon, authenticated;
grant select, insert, update, delete on site_leaves to anon, authenticated;
grant select, insert, update, delete on leave_seen_status to anon, authenticated;
grant select, insert, update, delete on dpr_reports to anon, authenticated;
grant select, insert, update, delete on dpr_drafts to anon, authenticated;
grant select, insert, update, delete on wpr_reports to anon, authenticated;
grant select, insert, update, delete on wpr_drafts to anon, authenticated;
grant select, insert, update, delete on site_reports to anon, authenticated;
grant select, insert, update, delete on svr_drafts to anon, authenticated;

-- Example: mark a TaskFlow admin/head who can toggle Site UI
-- update users set is_head = true where username = 'chirag.s';

-- Example: create a Site Engineer (password via TaskFlow admin UI or script)
-- insert into users (username, password_hash, full_name, department, designation, role, site_name, is_active)
-- values ('harshil.p', '<bcrypt>', 'Harshil Prajapati', 'Site Engineer', 'Site Engineer', 'employee', 'Site A', true);

-- ##### 3) fix_attendance_and_site.sql #####
-- Fix Site Engineer attendance + harshil site
-- Run in Supabase → SQL Editor → Run

-- 1) Ensure attendance table exists
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_name text not null,
  date date not null,
  clock_in timestamptz,
  clock_out timestamptz,
  status text,
  clock_in_image text,
  clock_out_image text,
  clock_in_location text,
  clock_out_location text,
  clock_in_status text,
  clock_out_status text,
  created_at timestamptz not null default now(),
  unique (user_name, date)
);

create index if not exists idx_attendance_user_date on public.attendance (user_name, date);

-- 2) Allow anon key (Site React uses anon) to use it
alter table public.attendance enable row level security;
drop policy if exists "site_attendance_all" on public.attendance;
create policy "site_attendance_all" on public.attendance for all using (true) with check (true);
grant select, insert, update, delete on public.attendance to anon, authenticated;

-- Same for other site tables the portal needs
alter table public.site_leaves enable row level security;
drop policy if exists "site_leaves_all" on public.site_leaves;
create policy "site_leaves_all" on public.site_leaves for all using (true) with check (true);
grant select, insert, update, delete on public.site_leaves to anon, authenticated;

grant select on public.site_user_details to anon, authenticated;

-- 3) Assign Harshil to a project/site (CHANGE site name if needed)
update public.users
set
  site_name = 'SMJV Boys Hostel',
  site_names = '["SMJV Boys Hostel"]'::jsonb
where username = 'harshil.p';

-- 4) Reload API schema cache
notify pgrst, 'reload schema';

-- ##### 4) fix_dpr_manpower_dropdowns.sql #####
-- =====================================================================
-- Fix DPR Manpower dropdowns + missing tables (Site Engineer)
-- Supabase → SQL Editor → paste → Run
-- =====================================================================

-- ---- Missing tables ----
create table if not exists public.material_requirements (
  id uuid primary key default gen_random_uuid(),
  material_name text,
  unit_name text,
  quantity numeric,
  site_name text,
  requested_by text,
  status text default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.site_leaves (
  id uuid primary key default gen_random_uuid(),
  user_name text not null,
  name text,
  leave_type text,
  from_date date not null,
  to_date date not null,
  reason text,
  site_name text,
  level_approver_user_name text,
  level_approver_name text,
  level_approver_role text,
  level_approved boolean,
  head_approver_user_name text,
  head_approver_name text,
  head_approver_role text,
  head_approved boolean,
  status text default 'pending',
  rejection_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.leave_seen_status (
  user_name text primary key,
  snapshot jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.dpr_skills (
  id bigserial primary key,
  name text unique not null
);

create table if not exists public.dpr_scopes (
  id bigserial primary key,
  name text unique not null
);

create table if not exists public.manpower (
  id bigserial primary key,
  scope text not null,
  manpowertype text not null,
  created_at timestamptz default now()
);

create table if not exists public.man_type (
  id bigserial primary key,
  category text,
  manpowertype text,
  created_at timestamptz default now()
);

create table if not exists public.workcategory (
  id bigserial primary key,
  category text unique,
  created_at timestamptz default now()
);

create table if not exists public.dpr_equipment (
  id bigserial primary key,
  name text,
  meta jsonb,
  created_at timestamptz default now()
);

create table if not exists public.dpr_units (
  id bigserial primary key,
  name text unique
);

-- ---- Seed master dropdown data (skip if already there) ----
insert into public.dpr_scopes (name) values
  ('CLIENT'), ('PMC'), ('CONTRACTOR')
on conflict (name) do nothing;

insert into public.dpr_skills (name) values
  ('Skilled'), ('Semi-skilled'), ('Unskilled')
on conflict (name) do nothing;

insert into public.dpr_units (name) values
  ('Nos'), ('Kg'), ('Ton'), ('Cum'), ('Sqm'), ('Rmt'), ('Litre'), ('Bag')
on conflict (name) do nothing;

-- Common manpower types by scope (only insert if that type not already for scope)
insert into public.manpower (scope, manpowertype)
select v.scope, v.manpowertype
from (values
  ('contractor', 'Mason'),
  ('contractor', 'Helper'),
  ('contractor', 'Carpenter'),
  ('contractor', 'Barbender'),
  ('contractor', 'Electrician'),
  ('contractor', 'Plumber'),
  ('contractor', 'Painter'),
  ('contractor', 'Welder'),
  ('contractor', 'Supervisor'),
  ('client', 'Client Representative'),
  ('client', 'Client Engineer'),
  ('pmc', 'PMC Engineer'),
  ('pmc', 'PMC Supervisor')
) as v(scope, manpowertype)
where not exists (
  select 1 from public.manpower m
  where lower(m.scope) = lower(v.scope)
    and lower(m.manpowertype) = lower(v.manpowertype)
);

insert into public.workcategory (category)
select v.category from (values
  ('Civil'), ('Structural'), ('Finishing'), ('MEP'), ('External Development')
) as v(category)
where not exists (
  select 1 from public.workcategory w where lower(w.category) = lower(v.category)
);

-- Link some types to categories (contractor filter)
insert into public.man_type (category, manpowertype)
select v.category, v.manpowertype
from (values
  ('Civil', 'Mason'),
  ('Civil', 'Helper'),
  ('Structural', 'Barbender'),
  ('Structural', 'Welder'),
  ('Finishing', 'Painter'),
  ('Finishing', 'Carpenter'),
  ('MEP', 'Electrician'),
  ('MEP', 'Plumber')
) as v(category, manpowertype)
where not exists (
  select 1 from public.man_type t
  where lower(t.category) = lower(v.category)
    and lower(t.manpowertype) = lower(v.manpowertype)
);

-- ---- Grants + RLS so anon key (Site React) can read/write ----
do $$
declare
  t text;
begin
  foreach t in array array[
    'material_requirements','site_leaves','leave_seen_status',
    'dpr_skills','dpr_scopes','manpower','man_type','workcategory',
    'dpr_equipment','dpr_units','dpr_reports','dpr_drafts',
    'attendance','wpr_reports','wpr_drafts','wpr_images',
    'site_reports','svr_drafts','site_details','user_site_assignments'
  ]
  loop
    begin
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists site_open_%I on public.%I', t, t);
      execute format(
        'create policy site_open_%I on public.%I for all using (true) with check (true)',
        t, t
      );
      execute format(
        'grant select, insert, update, delete on public.%I to anon, authenticated',
        t
      );
    exception when undefined_table then
      raise notice 'skip missing table %', t;
    when others then
      raise notice 'skip % : %', t, sqlerrm;
    end;
  end loop;
end $$;

-- sequences for bigserial tables
grant usage, select on all sequences in schema public to anon, authenticated;

grant select on public.site_user_details to anon, authenticated;

notify pgrst, 'reload schema';

-- ##### 5) fix_wpr_tables.sql #####
-- WPR tables: columns the React WPR generator actually inserts
-- Supabase → SQL Editor → Run

create table if not exists public.wpr_reports (
  id uuid primary key default gen_random_uuid(),
  site_name text,
  engineer_name text,
  report_date text,
  report_number text,
  location text,
  status text,
  activities jsonb,
  next_week_plans jsonb,
  drawing_register_headers jsonb,
  drawing_register_data jsonb,
  office_activity_items jsonb,
  visitor_register_data jsonb,
  drawing_decision_data jsonb,
  delay_points jsonb,
  report_sections jsonb,
  submitted_by text,
  presentation_url text,
  site_image_url text,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- Add missing columns if table already existed with thin schema
alter table public.wpr_reports add column if not exists location text;
alter table public.wpr_reports add column if not exists status text;
alter table public.wpr_reports add column if not exists activities jsonb;
alter table public.wpr_reports add column if not exists next_week_plans jsonb;
alter table public.wpr_reports add column if not exists drawing_register_headers jsonb;
alter table public.wpr_reports add column if not exists drawing_register_data jsonb;
alter table public.wpr_reports add column if not exists office_activity_items jsonb;
alter table public.wpr_reports add column if not exists visitor_register_data jsonb;
alter table public.wpr_reports add column if not exists drawing_decision_data jsonb;
alter table public.wpr_reports add column if not exists delay_points jsonb;
alter table public.wpr_reports add column if not exists report_sections jsonb;
alter table public.wpr_reports add column if not exists submitted_by text;
alter table public.wpr_reports add column if not exists presentation_url text;
alter table public.wpr_reports add column if not exists site_image_url text;
-- report_date may be date type — allow text-like storage via cast-safe alter
do $$ begin
  alter table public.wpr_reports alter column report_date type text using report_date::text;
exception when others then null;
end $$;
do $$ begin
  alter table public.wpr_reports alter column report_number type text using report_number::text;
exception when others then null;
end $$;

create table if not exists public.wpr_drafts (
  id uuid primary key default gen_random_uuid(),
  site_name text,
  engineer_name text,
  payload jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.wpr_images (
  id uuid primary key default gen_random_uuid(),
  wpr_report_id uuid,
  image_type text,
  storage_path text,
  public_url text,
  caption text,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists public.site_details (
  id uuid primary key default gen_random_uuid(),
  site_name text unique,
  meta jsonb
);

alter table public.wpr_reports enable row level security;
drop policy if exists site_open_wpr_reports on public.wpr_reports;
create policy site_open_wpr_reports on public.wpr_reports for all using (true) with check (true);
grant select, insert, update, delete on public.wpr_reports to anon, authenticated;

alter table public.wpr_drafts enable row level security;
drop policy if exists site_open_wpr_drafts on public.wpr_drafts;
create policy site_open_wpr_drafts on public.wpr_drafts for all using (true) with check (true);
grant select, insert, update, delete on public.wpr_drafts to anon, authenticated;

alter table public.wpr_images enable row level security;
drop policy if exists site_open_wpr_images on public.wpr_images;
create policy site_open_wpr_images on public.wpr_images for all using (true) with check (true);
grant select, insert, update, delete on public.wpr_images to anon, authenticated;

alter table public.site_details enable row level security;
drop policy if exists site_open_site_details on public.site_details;
create policy site_open_site_details on public.site_details for all using (true) with check (true);
grant select, insert, update, delete on public.site_details to anon, authenticated;

notify pgrst, 'reload schema';

-- ##### 6) fix_site_reports_and_storage.sql #####
-- Fix Site Visit + storage for Site Engineer
-- Supabase → SQL Editor → Run ALL

-- 1) site_reports
create table if not exists public.site_reports (
  id uuid primary key default gen_random_uuid(),
  visit_date date,
  visit_time text,
  site_name text,
  reporter_name text,
  designation text,
  progress_of_work text,
  quality_observations text,
  safety_concerns text,
  issues_concerns text,
  site_visit_instructions text,
  key_instructions text,
  submitted_by text,
  submitted_by_name text,
  pdf_url text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_site_reports_site_date
  on public.site_reports (site_name, visit_date);

-- 2) svr drafts
create table if not exists public.svr_drafts (
  id uuid primary key default gen_random_uuid(),
  site_name text,
  reporter text,
  payload jsonb,
  saved_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- unique pair for upsert (ignore if constraint already exists)
do $$ begin
  alter table public.svr_drafts
    add constraint svr_drafts_site_reporter_uq unique (site_name, reporter);
exception when duplicate_table or duplicate_object then null;
end $$;

-- 3) Table grants + RLS open for anon (Site React)
alter table public.site_reports enable row level security;
drop policy if exists site_open_site_reports on public.site_reports;
create policy site_open_site_reports on public.site_reports for all using (true) with check (true);
grant select, insert, update, delete on public.site_reports to anon, authenticated;

alter table public.svr_drafts enable row level security;
drop policy if exists site_open_svr_drafts on public.svr_drafts;
create policy site_open_svr_drafts on public.svr_drafts for all using (true) with check (true);
grant select, insert, update, delete on public.svr_drafts to anon, authenticated;

-- 4) Storage policies for site-files / attendance-photos / documents
-- (in case any client-side upload still hits Storage directly)
insert into storage.buckets (id, name, public)
values ('site-files', 'site-files', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('attendance-photos', 'attendance-photos', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do update set public = true;

drop policy if exists "site_files_select" on storage.objects;
drop policy if exists "site_files_insert" on storage.objects;
drop policy if exists "site_files_update" on storage.objects;
drop policy if exists "site_files_delete" on storage.objects;

create policy "site_files_select" on storage.objects
  for select to public using (bucket_id in ('site-files','attendance-photos','documents'));
create policy "site_files_insert" on storage.objects
  for insert to public with check (bucket_id in ('site-files','attendance-photos','documents'));
create policy "site_files_update" on storage.objects
  for update to public using (bucket_id in ('site-files','attendance-photos','documents'));
create policy "site_files_delete" on storage.objects
  for delete to public using (bucket_id in ('site-files','attendance-photos','documents'));

notify pgrst, 'reload schema';

-- ##### 7) fix_site_portal_missing.sql #####
-- =====================================================================
-- Site portal tables missing in TaskFlow Supabase (404 / 400 on DPR page)
-- Run once in Supabase → SQL Editor → Run
-- =====================================================================

-- Material requirements (columns match MatRequirement.jsx + Dpr.jsx)
create table if not exists public.material_requirements (
  id uuid primary key default gen_random_uuid(),
  material_name text,
  unit_name text,
  quantity numeric,
  site_name text,
  requested_by text,
  status text default 'pending',
  received_at timestamptz,
  received_by text,
  rejected_at timestamptz,
  rejected_by text,
  rejection_reason text,
  created_at timestamptz not null default now()
);

alter table public.material_requirements add column if not exists material_name text;
alter table public.material_requirements add column if not exists unit_name text;
alter table public.material_requirements add column if not exists quantity numeric;
alter table public.material_requirements add column if not exists site_name text;
alter table public.material_requirements add column if not exists requested_by text;
alter table public.material_requirements add column if not exists status text;
alter table public.material_requirements add column if not exists received_at timestamptz;
alter table public.material_requirements add column if not exists received_by text;
alter table public.material_requirements add column if not exists rejected_at timestamptz;
alter table public.material_requirements add column if not exists rejected_by text;
alter table public.material_requirements add column if not exists rejection_reason text;
alter table public.material_requirements add column if not exists created_at timestamptz;

update public.material_requirements set status = 'pending' where status is null;
update public.material_requirements set created_at = now() where created_at is null;

-- Site leaves
create table if not exists public.site_leaves (
  id uuid primary key default gen_random_uuid(),
  user_name text not null,
  name text,
  leave_type text,
  from_date date not null,
  to_date date not null,
  reason text,
  site_name text,
  level_approver_user_name text,
  level_approver_name text,
  level_approver_role text,
  level_approved boolean,
  head_approver_user_name text,
  head_approver_name text,
  head_approver_role text,
  head_approved boolean,
  status text default 'pending',
  rejection_reason text,
  created_at timestamptz not null default now()
);

-- Leave badge snapshot
create table if not exists public.leave_seen_status (
  user_name text primary key,
  snapshot jsonb,
  updated_at timestamptz not null default now()
);

-- Site assignments (no FK to user_details — TaskFlow uses users table)
create table if not exists public.user_site_assignments (
  id uuid primary key default gen_random_uuid(),
  user_name text,
  full_name text,
  site_name text,
  unique (user_name, site_name)
);

alter table public.user_site_assignments add column if not exists full_name text;

-- DPR core (if still missing)
create table if not exists public.dpr_reports (
  id uuid primary key default gen_random_uuid(),
  site text,
  engineer text,
  report_type text,
  date date,
  payload jsonb,
  pdf_url text,
  photo_folder text,
  created_at timestamptz not null default now()
);

create table if not exists public.dpr_drafts (
  id uuid primary key default gen_random_uuid(),
  site text,
  engineer text,
  payload jsonb,
  saved_at timestamptz not null default now()
);

-- Open RLS for Site React (anon key)
do $$
declare
  t text;
begin
  foreach t in array array[
    'material_requirements',
    'site_leaves',
    'leave_seen_status',
    'user_site_assignments',
    'dpr_reports',
    'dpr_drafts'
  ]
  loop
    begin
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists site_open_%I on public.%I', t, t);
      execute format(
        'create policy site_open_%I on public.%I for all using (true) with check (true)',
        t, t
      );
      execute format(
        'grant select, insert, update, delete on public.%I to anon, authenticated',
        t
      );
    exception when undefined_table then
      raise notice 'skip missing %', t;
    when others then
      raise notice 'skip % : %', t, sqlerrm;
    end;
  end loop;
end $$;

-- Also ensure site_user_details view exists for Site portal refresh
create or replace view public.site_user_details as
select
  u.id,
  u.username,
  u.full_name as name,
  u.department,
  coalesce(nullif(trim(u.designation), ''), u.role) as role,
  case when u.is_active then 'Active' else 'Inactive' end as status,
  u.site_name,
  u.site_names,
  u.created_at,
  u.is_head,
  null::text as password
from public.users u;

grant select on public.site_user_details to anon, authenticated;

notify pgrst, 'reload schema';

-- ##### 8) fix_equipment_seed.sql #####
-- Equipment master for Daily Report
-- Run in Supabase SQL Editor

-- Ensure columns exist (older DBs may only have name/meta)
create table if not exists public.dpr_equipment (
  id bigserial primary key,
  name text not null,
  source text,
  created_at timestamptz default now()
);
alter table public.dpr_equipment add column if not exists source text;
alter table public.dpr_equipment add column if not exists name text;

create table if not exists public.dpr_equipment_units (
  id bigserial primary key,
  name text unique not null
);

create table if not exists public.dpr_units (
  id bigserial primary key,
  name text unique not null
);

insert into public.dpr_equipment_units (name) values
  ('Nos'), ('Hrs'), ('Days'), ('Trips')
on conflict (name) do nothing;

insert into public.dpr_units (name) values
  ('Nos'), ('Kg'), ('Ton'), ('Cum'), ('Sqm'), ('Rmt'), ('Litre'), ('Bag'), ('Hrs')
on conflict (name) do nothing;

insert into public.dpr_equipment (name, source)
select v.name, v.source from (values
  ('Excavator', 'contractor'),
  ('JCB', 'contractor'),
  ('Tower Crane', 'contractor'),
  ('Mobile Crane', 'contractor'),
  ('Concrete Mixer', 'contractor'),
  ('Transit Mixer', 'contractor'),
  ('Vibrator', 'contractor'),
  ('Compactor', 'contractor'),
  ('Generator', 'contractor'),
  ('Welding Machine', 'contractor'),
  ('Bar Cutting Machine', 'contractor'),
  ('Bar Bending Machine', 'contractor'),
  ('Scaffolding', 'contractor'),
  ('Water Tanker', 'contractor'),
  ('Tractor', 'contractor'),
  ('Dumper', 'contractor'),
  ('Client Excavator', 'client'),
  ('Client Crane', 'client'),
  ('Client Generator', 'client'),
  ('Client Vehicle', 'client')
) as v(name, source)
where not exists (
  select 1 from public.dpr_equipment e
  where lower(coalesce(e.name,''))=lower(v.name)
    and lower(coalesce(e.source,''))=lower(v.source)
);

alter table public.dpr_equipment enable row level security;
drop policy if exists site_open_dpr_equipment on public.dpr_equipment;
create policy site_open_dpr_equipment on public.dpr_equipment for all using (true) with check (true);
grant select, insert, update, delete on public.dpr_equipment to anon, authenticated;

alter table public.dpr_equipment_units enable row level security;
drop policy if exists site_open_dpr_equipment_units on public.dpr_equipment_units;
create policy site_open_dpr_equipment_units on public.dpr_equipment_units for all using (true) with check (true);
grant select, insert, update, delete on public.dpr_equipment_units to anon, authenticated;

alter table public.dpr_units enable row level security;
drop policy if exists site_open_dpr_units on public.dpr_units;
create policy site_open_dpr_units on public.dpr_units for all using (true) with check (true);
grant select, insert, update, delete on public.dpr_units to anon, authenticated;

grant usage, select on all sequences in schema public to anon, authenticated;
notify pgrst, 'reload schema';

-- ##### 9) add_client_role.sql #####
-- Allow role: client (client portal login; employee-like account scoped to sites)
-- Run once in Supabase SQL Editor.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'employee', 'head', 'client'));

-- ##### 10) add_head_role.sql #####
-- Allow Manage Employees role: Head (employee rights + Office/Site toggle)
-- Run this once in Supabase SQL Editor.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'employee', 'head'));

-- ##### 11) add_leave_buddy.sql #####
-- Leave buddy cover + WhatsApp number on users
-- Run once in Supabase SQL Editor

alter table public.users
  add column if not exists whatsapp_number text;

alter table public.leaves
  add column if not exists buddy_id uuid references public.users(id),
  add column if not exists buddy_status text default 'None',
  add column if not exists buddy_responded_at timestamptz,
  add column if not exists buddy_note text;

-- Track tasks temporarily covered by a buddy during leave
alter table public.tasks
  add column if not exists leave_cover_id uuid references public.leaves(id),
  add column if not exists leave_cover_from uuid references public.users(id);

-- buddy_status: None | Pending | Accepted | Declined
do $$
begin
  alter table public.leaves drop constraint if exists leaves_buddy_status_check;
  alter table public.leaves
    add constraint leaves_buddy_status_check
    check (buddy_status in ('None', 'Pending', 'Accepted', 'Declined'));
exception when others then
  raise notice 'buddy_status check: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';

-- ##### 12) add_leave_cover_needed.sql #####
-- Unresolved leave cover when buddy declines but leave is approved
-- Run once in Supabase SQL Editor

alter table public.leaves
  add column if not exists cover_needed boolean default false,
  add column if not exists cover_resolved_at timestamptz;

notify pgrst, 'reload schema';

-- ##### 13) add_office_site_permission.sql #####
-- Office ↔ Site switch permission + ensure leave buddy columns exist
-- Run once in Supabase SQL Editor

alter table public.users
  add column if not exists can_switch_office_site boolean not null default false;

alter table public.users
  add column if not exists can_resolve_tickets boolean not null default false;

alter table public.users
  add column if not exists whatsapp_number text;

alter table public.leaves
  add column if not exists buddy_id uuid references public.users(id),
  add column if not exists buddy_status text default 'None',
  add column if not exists buddy_responded_at timestamptz,
  add column if not exists buddy_note text;

alter table public.tasks
  add column if not exists leave_cover_id uuid references public.leaves(id),
  add column if not exists leave_cover_from uuid references public.users(id);

do $$
begin
  alter table public.leaves drop constraint if exists leaves_buddy_status_check;
  alter table public.leaves
    add constraint leaves_buddy_status_check
    check (buddy_status in ('None', 'Pending', 'Accepted', 'Declined'));
exception when others then
  raise notice 'buddy_status check: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';

-- ##### 14) add_recurring_not_applicable.sql #####
-- Recurring instance: Not Applicable (today only; next week still fires)
-- Run once in Supabase SQL Editor

alter table public.recurring_task_instances
  drop constraint if exists recurring_task_instances_status_check;

alter table public.recurring_task_instances
  add constraint recurring_task_instances_status_check
  check (status in ('Pending', 'Completed', 'NotApplicable'));

notify pgrst, 'reload schema';

-- ##### 15) add_dip_bot.sql #####
-- DIP AI Bot + Team Chat + Project Management
-- Run once in Supabase SQL Editor

-- Who works on which project (shift people between projects)
create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role_on_project text default 'member',
  assigned_at timestamptz default now(),
  assigned_by uuid references public.users(id),
  unique (project_id, user_id)
);

create index if not exists project_members_user_idx on public.project_members(user_id);
create index if not exists project_members_project_idx on public.project_members(project_id);

-- In-app chat rooms: dm | project (WhatsApp-group alternative)
create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('dm', 'project', 'bot')),
  title text,
  project_id uuid references public.projects(id) on delete cascade,
  invite_code text unique,
  created_by uuid references public.users(id),
  created_at timestamptz default now()
);

create table if not exists public.chat_room_members (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (room_id, user_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  sender_id uuid references public.users(id) on delete set null,
  body text not null,
  is_bot boolean default false,
  created_at timestamptz default now()
);

create index if not exists chat_messages_room_idx on public.chat_messages(room_id, created_at);

-- Bot Q&A history + alerts to admin
create table if not exists public.bot_qa (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  question text not null,
  answer text not null,
  is_admin_only_data boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.bot_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  body text not null,
  link_hint text,
  is_read boolean default false,
  created_at timestamptz default now()
);

create index if not exists bot_alerts_user_idx on public.bot_alerts(user_id, is_read);

-- Overdue WhatsApp dedupe (one alert per task per day)
create table if not exists public.overdue_wa_log (
  task_id uuid not null references public.tasks(id) on delete cascade,
  alert_day date not null,
  sent_at timestamptz default now(),
  primary key (task_id, alert_day)
);

notify pgrst, 'reload schema';

-- ##### 16) only_missing.sql (safe extras) #####
-- =====================================================================
-- ONLY what's still missing on your TaskFlow DB
-- (dpr_*, manpower, attendance, site_leaves, etc. already exist — skip those)
-- Run this in Supabase → SQL Editor → Run
-- =====================================================================

-- 1) Head toggle + site fields on users
alter table users add column if not exists is_head boolean not null default false;
alter table users add column if not exists site_name text;
alter table users add column if not exists site_names jsonb;

-- 2) Site Engineer department (you already have "Site" — this adds the exact name the app checks)
insert into departments (name)
values ('Site Engineer')
on conflict (name) do nothing;

-- 3) View so Site React pages can read user info (no password)
create or replace view site_user_details as
select
  u.id,
  u.username,
  u.full_name as name,
  u.department,
  coalesce(nullif(trim(u.designation), ''), u.role) as role,
  case when u.is_active then 'Active' else 'Inactive' end as status,
  u.site_name,
  u.site_names,
  u.created_at,
  u.is_head,
  null::text as password
from users u;

grant select on site_user_details to anon, authenticated;

-- 4) Example: mark a head (CHANGE username)
-- update users set is_head = true where username = 'chirag.s';

notify pgrst, 'reload schema';
