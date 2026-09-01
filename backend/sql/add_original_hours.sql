-- Preserve assigned hours across Hold/Resume (timer uses remaining separately).
-- Run once in Supabase → SQL Editor → Run

alter table public.tasks
  add column if not exists original_hours_to_complete numeric;

alter table public.tasks
  add column if not exists first_accepted_at timestamptz;

-- Backfill: existing rows keep whatever hours they have now as "original"
-- (already-resumed tasks may show reduced hours until re-assigned)
update public.tasks
set original_hours_to_complete = hours_to_complete
where original_hours_to_complete is null
  and hours_to_complete is not null;

update public.tasks
set first_accepted_at = accepted_at
where first_accepted_at is null
  and accepted_at is not null;

notify pgrst, 'reload schema';
