-- Allow granting "Add task" to any employee (not only admin).
-- Run once in Supabase → SQL Editor → Run

alter table public.users
  add column if not exists can_add_task boolean not null default false;

notify pgrst, 'reload schema';
