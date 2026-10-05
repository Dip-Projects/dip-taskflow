-- Weekly plan tasks parsed from EA Excel uploads.
-- Used for WhatsApp day lists + number-reply completion.

create table if not exists public.weekly_plan_tasks (
  id uuid primary key default gen_random_uuid(),

  ea_attendance_id uuid,
  employee_id text,
  employee_username text not null,
  employee_name text,
  site_name text,

  week_start date not null,
  week_end date,

  task_date date not null,
  task_name text not null,
  time_slot text,
  sr_no int,
  half smallint not null default 0,
  source_file text, -- attachment_1 | attachment_2

  status text not null default 'Pending',
  -- Pending | In Progress | Completed | On Hold | Cancelled

  completed_at timestamptz,
  completed_via text, -- whatsapp | excel | portal

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists weekly_plan_tasks_user_date_idx
  on public.weekly_plan_tasks (employee_username, task_date);

create index if not exists weekly_plan_tasks_week_idx
  on public.weekly_plan_tasks (week_start, employee_username);

create index if not exists weekly_plan_tasks_ea_idx
  on public.weekly_plan_tasks (ea_attendance_id);

drop index if exists public.weekly_plan_tasks_dedupe_idx;
create unique index if not exists weekly_plan_tasks_dedupe_idx
  on public.weekly_plan_tasks (ea_attendance_id, task_date, source_file, sr_no, task_name, half, time_slot);

comment on table public.weekly_plan_tasks is
  'Tasks extracted from EM weekly plan Excel; WhatsApp number-reply marks Completed.';

alter table public.weekly_plan_tasks enable row level security;

drop policy if exists "weekly_plan_tasks_select" on public.weekly_plan_tasks;
drop policy if exists "weekly_plan_tasks_insert" on public.weekly_plan_tasks;
drop policy if exists "weekly_plan_tasks_update" on public.weekly_plan_tasks;

create policy "weekly_plan_tasks_select"
  on public.weekly_plan_tasks for select using (true);
create policy "weekly_plan_tasks_insert"
  on public.weekly_plan_tasks for insert with check (true);
create policy "weekly_plan_tasks_update"
  on public.weekly_plan_tasks for update using (true) with check (true);

grant select, insert, update, delete on public.weekly_plan_tasks to anon, authenticated;

-- Flat weekly-plan sheet rows for reporting/filtering.
-- Stores one Excel task row per record with week range + task + status.
create table if not exists public.weekly_plan_sheet (
  id uuid primary key default gen_random_uuid(),

  ea_attendance_id uuid,
  employee_id text,
  employee_username text not null,
  employee_name text,
  site_name text,

  week_from date not null,
  week_to date,
  task_date date,
  task text not null,
  status text not null default 'Pending'
    check (status in ('Pending', 'In Progress', 'Completed', 'On Hold', 'Cancelled')),

  source_file text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists weekly_plan_sheet_user_week_idx
  on public.weekly_plan_sheet (employee_username, week_from);

create index if not exists weekly_plan_sheet_status_idx
  on public.weekly_plan_sheet (status, employee_username);

create index if not exists weekly_plan_sheet_ea_idx
  on public.weekly_plan_sheet (ea_attendance_id);

create unique index if not exists weekly_plan_sheet_dedupe_idx
  on public.weekly_plan_sheet (ea_attendance_id, employee_username, week_from, task, task_date);

comment on table public.weekly_plan_sheet is
  'Flat weekly plan sheet rows from EA Excel uploads with week_from, week_to, task and status columns.';

alter table public.weekly_plan_sheet enable row level security;

drop policy if exists "weekly_plan_sheet_select" on public.weekly_plan_sheet;
drop policy if exists "weekly_plan_sheet_insert" on public.weekly_plan_sheet;
drop policy if exists "weekly_plan_sheet_update" on public.weekly_plan_sheet;

create policy "weekly_plan_sheet_select"
  on public.weekly_plan_sheet for select using (true);
create policy "weekly_plan_sheet_insert"
  on public.weekly_plan_sheet for insert with check (true);
create policy "weekly_plan_sheet_update"
  on public.weekly_plan_sheet for update using (true) with check (true);

grant select, insert, update, delete on public.weekly_plan_sheet to anon, authenticated;
