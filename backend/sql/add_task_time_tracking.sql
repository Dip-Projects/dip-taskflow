-- Task cycle timestamps + correction extra time
-- Run once in Supabase SQL Editor

alter table public.tasks add column if not exists assigned_at timestamptz;
alter table public.tasks add column if not exists extra_hours numeric not null default 0;
alter table public.tasks add column if not exists extra_days numeric not null default 0;
alter table public.tasks add column if not exists correction_extensions jsonb default '[]'::jsonb;

-- Backfill assign time from created_at
update public.tasks
set assigned_at = created_at
where assigned_at is null;

notify pgrst, 'reload schema';
