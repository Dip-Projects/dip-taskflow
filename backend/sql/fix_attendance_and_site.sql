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
