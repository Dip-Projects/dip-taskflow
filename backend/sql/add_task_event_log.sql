-- Permanent timestamps for every task step. Safe to re-run.
-- Start task / Send for verification / Start verification / Verified
-- First-time stamps are never overwritten. task_events is a full log.

alter table public.tasks add column if not exists assigned_at timestamptz;
alter table public.tasks add column if not exists accepted_at timestamptz;
alter table public.tasks add column if not exists sent_for_verification_at timestamptz;
alter table public.tasks add column if not exists verification_started_at timestamptz;
alter table public.tasks add column if not exists verification_started_by uuid;
alter table public.tasks add column if not exists verified_at timestamptz;
alter table public.tasks add column if not exists rejected_at timestamptz;
alter table public.tasks add column if not exists verification_decided_at timestamptz;
alter table public.tasks add column if not exists first_sent_for_verification_at timestamptz;
alter table public.tasks add column if not exists first_verification_started_at timestamptz;
alter table public.tasks add column if not exists first_verified_at timestamptz;
alter table public.tasks add column if not exists task_events jsonb default '[]'::jsonb;

update public.tasks set assigned_at = created_at where assigned_at is null;
update public.tasks set first_sent_for_verification_at = sent_for_verification_at
  where first_sent_for_verification_at is null and sent_for_verification_at is not null;
update public.tasks set first_verification_started_at = verification_started_at
  where first_verification_started_at is null and verification_started_at is not null;
update public.tasks set first_verified_at = verified_at
  where first_verified_at is null and verified_at is not null;

notify pgrst, 'reload schema';
