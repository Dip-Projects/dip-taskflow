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
