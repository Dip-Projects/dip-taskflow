-- Separate columns for every plan / timer / hold fact so nothing overwrites history.
-- Run once in Supabase → SQL Editor → Run. Safe to re-run.
--
-- Rule: original_* and first_* and reschedule_* columns are written once and
-- never overwritten. target_date stays the CURRENT active plan (admin view),
-- original_target_date keeps the very first plan the admin set.

-- ── Plan dates ────────────────────────────────────────────────────────────────
-- First plan the admin chose at assign time (e.g. 5 Sept). Never changes.
alter table public.tasks add column if not exists original_target_date timestamptz;

-- Date that an approved reschedule moved the task to (e.g. 7 Sept). Snapshot.
alter table public.tasks add column if not exists reschedule_approved_target_date timestamptz;
alter table public.tasks add column if not exists reschedule_approved_at timestamptz;

-- How many times this task's plan was moved by an approved reschedule.
alter table public.tasks add column if not exists reschedule_count integer not null default 0;

-- ── Deadline snapshots (so reports never recompute a changed number) ─────────
-- assigned_at + original hours, in office hours. Written once at assign.
alter table public.tasks add column if not exists assigned_deadline_at timestamptz;

-- accepted_at (or resumed_at) + current budget, in office hours.
-- Rewritten on every accept / resume because that IS the live work deadline.
alter table public.tasks add column if not exists work_due_at timestamptz;

-- ── Accept cycles (reschedule approve forces a fresh accept) ─────────────────
alter table public.tasks add column if not exists accept_count integer not null default 0;
alter table public.tasks add column if not exists reaccept_required boolean not null default false;
alter table public.tasks add column if not exists reaccept_reason text;

-- 20-minute "please accept or request reschedule" nudge for short same-day tasks
alter table public.tasks add column if not exists accept_reminder_sent_at timestamptz;

-- ── Hold / resume durations ──────────────────────────────────────────────────
-- Office-hour seconds the task spent paused, summed across every hold.
alter table public.tasks add column if not exists total_hold_seconds numeric not null default 0;
-- Duration of the most recent completed hold (held_at → resumed_at).
alter table public.tasks add column if not exists last_hold_seconds numeric;
alter table public.tasks add column if not exists hold_count integer not null default 0;

-- ── Overdue tracking (daily WhatsApp reminders) ──────────────────────────────
-- First moment the task crossed its work deadline. Cleared only when the task
-- is completed / verified, so "X days overdue" is stable across days.
alter table public.tasks add column if not exists overdue_since_at timestamptz;
alter table public.tasks add column if not exists overdue_wa_last_sent_at timestamptz;
alter table public.tasks add column if not exists overdue_wa_sent_count integer not null default 0;

-- ── Backfill (only where the value is unambiguous) ───────────────────────────
update public.tasks
set original_target_date = target_date
where original_target_date is null
  and target_date is not null;

update public.tasks
set accept_count = 1
where accept_count = 0
  and accepted_at is not null;

notify pgrst, 'reload schema';
