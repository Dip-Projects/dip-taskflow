-- Store extra time requested by an employee with their reschedule request.
-- Run once in Supabase SQL Editor.

alter table public.tasks
  add column if not exists reschedule_requested_additional_hours numeric;

notify pgrst, 'reload schema';
