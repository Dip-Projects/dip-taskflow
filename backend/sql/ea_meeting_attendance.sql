-- EA Meeting attendance (Monday weekly meeting).
-- NOT clock-in / clock-out. Separate from regular attendance tables.

create table if not exists public.ea_meeting_attendance (
  id uuid primary key default gen_random_uuid(),

  -- Monday of the meeting week (IST)
  meeting_week_start date not null,
  meeting_week_end date not null,
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

  -- Weekly plan / Excel uploads for EA meeting
  attachment_1_url text,
  attachment_1_name text,
  attachment_2_url text,
  attachment_2_name text,
  plan_submitted_at timestamptz,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (employee_username, meeting_week_start)
);

comment on table public.ea_meeting_attendance is
  'Monday EA meeting QR attendance + plan uploads. Isolated from clock-in attendance.';

alter table public.ea_meeting_attendance enable row level security;

drop policy if exists "ea_meeting_attendance_select" on public.ea_meeting_attendance;
drop policy if exists "ea_meeting_attendance_insert" on public.ea_meeting_attendance;
drop policy if exists "ea_meeting_attendance_update" on public.ea_meeting_attendance;

create policy "ea_meeting_attendance_select"
  on public.ea_meeting_attendance for select using (true);
create policy "ea_meeting_attendance_insert"
  on public.ea_meeting_attendance for insert with check (true);
create policy "ea_meeting_attendance_update"
  on public.ea_meeting_attendance for update using (true) with check (true);

grant select, insert, update on public.ea_meeting_attendance to anon, authenticated;
