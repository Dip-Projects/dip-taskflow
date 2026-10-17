-- Pre-defined Task List (task_bank): tasks saved in advance, delegated later.
-- Hours + target date are NOT stored here — they are set when you assign.
-- Run once in Supabase → SQL Editor → Run. Safe to re-run.

create table if not exists public.task_bank (
  id                    uuid primary key default gen_random_uuid(),
  created_by            uuid not null references public.users(id) on delete cascade,
  title                 text not null,
  details               text,
  project_id            uuid references public.projects(id) on delete set null,
  task_type_id          uuid references public.task_types(id) on delete set null,
  department_id         uuid references public.departments(id) on delete set null,
  assigned_to           uuid references public.users(id) on delete set null,
  priority              text not null default 'Medium',
  rescheduling_possible boolean not null default false,
  times_delegated       integer not null default 0,
  last_delegated_at     timestamptz,
  created_at            timestamptz not null default now()
);

-- if you ran an earlier version of this file, these add the newer columns
alter table public.task_bank add column if not exists department_id uuid references public.departments(id) on delete set null;
alter table public.task_bank add column if not exists assigned_to uuid references public.users(id) on delete set null;
alter table public.task_bank add column if not exists priority text not null default 'Medium';
alter table public.task_bank add column if not exists rescheduling_possible boolean not null default false;

create index if not exists task_bank_created_by_idx on public.task_bank (created_by);
alter table public.task_bank enable row level security;

notify pgrst, 'reload schema';
