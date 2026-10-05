-- Office ↔ MDO switch permission
-- Run once in Supabase → SQL Editor → Run

alter table public.users
  add column if not exists can_switch_office_mdo boolean not null default false;

notify pgrst, 'reload schema';
