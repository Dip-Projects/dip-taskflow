-- Task hold / resume (pause remaining working hours). Run in Supabase SQL Editor.

alter table public.tasks add column if not exists is_on_hold boolean not null default false;
alter table public.tasks add column if not exists hold_remaining_hours numeric;
alter table public.tasks add column if not exists held_at timestamptz;
alter table public.tasks add column if not exists resumed_at timestamptz;

notify pgrst, 'reload schema';
