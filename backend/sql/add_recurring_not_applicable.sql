-- Recurring instance: Not Applicable (today only; next week still fires)
-- Run once in Supabase SQL Editor

alter table public.recurring_task_instances
  drop constraint if exists recurring_task_instances_status_check;

alter table public.recurring_task_instances
  add constraint recurring_task_instances_status_check
  check (status in ('Pending', 'Completed', 'NotApplicable'));

notify pgrst, 'reload schema';
