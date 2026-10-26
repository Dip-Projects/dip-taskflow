-- Add the half column (1 = 1st half, 2 = 2nd half, 0 = whole-day / no half layout)
alter table public.weekly_plan_tasks
  add column if not exists half smallint not null default 0;

-- The old unique index didn't include `half` or `time_slot`, so two legitimate
-- rows (1st half vs 2nd half of the same task, or two tasks stacked in the
-- same half) collided on the same key and made the WHOLE batch insert fail.
drop index if exists public.weekly_plan_tasks_dedupe_idx;

create unique index if not exists weekly_plan_tasks_dedupe_idx
  on public.weekly_plan_tasks (ea_attendance_id, task_date, source_file, sr_no, task_name, half, time_slot);