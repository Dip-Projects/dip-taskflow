-- New QR Site Attendance + Weekly Plan table.
-- Isolated from existing attendance / reports tables.

create table if not exists public.qr_site_attendance (
  id uuid primary key default gen_random_uuid(),
  scan_date date not null default (timezone('Asia/Kolkata', now()))::date,
  scanned_at timestamptz not null default now(),

  employee_id text,
  employee_username text not null,
  employee_name text,
  employee_role text,
  employee_department text,
  employee_site_name text,
  attendance_status text not null default 'present',

  scanned_by_username text,
  scanned_by_name text,

  weekly_plan text,
  week_start date,
  week_end date,
  attachment_1_url text,
  attachment_1_name text,
  attachment_2_url text,
  attachment_2_name text,
  plan_submitted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_username, scan_date)
);

alter table public.qr_site_attendance enable row level security;

drop policy if exists "qr_site_attendance_select" on public.qr_site_attendance;
drop policy if exists "qr_site_attendance_insert" on public.qr_site_attendance;
drop policy if exists "qr_site_attendance_update" on public.qr_site_attendance;

create policy "qr_site_attendance_select"
  on public.qr_site_attendance for select using (true);
create policy "qr_site_attendance_insert"
  on public.qr_site_attendance for insert with check (true);
create policy "qr_site_attendance_update"
  on public.qr_site_attendance for update using (true) with check (true);

grant select, insert, update on public.qr_site_attendance to anon, authenticated;
