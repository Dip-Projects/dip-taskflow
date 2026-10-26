-- Allow each task type to include or omit common checklist checks.
-- Existing task types keep the current behavior by default.

alter table public.task_types
  add column if not exists include_common_checks boolean not null default true;

notify pgrst, 'reload schema';
