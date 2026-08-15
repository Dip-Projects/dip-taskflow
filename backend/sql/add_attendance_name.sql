-- Old MDO attendance queries still ask for attendance.name.
-- The table only has user_name. This column makes those queries succeed.
-- Run once in Supabase → SQL Editor → Run

alter table public.attendance
  add column if not exists name text;

update public.attendance
set name = user_name
where name is null and user_name is not null;

notify pgrst, 'reload schema';
