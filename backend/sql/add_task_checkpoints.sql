-- Delegated-task checkpoints. Run this in Supabase → SQL Editor, then assign again.
-- Fixes: Could not find the table 'public.task_checkpoints' in the schema cache

create table if not exists public.task_checkpoints (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  is_done boolean not null default false,
  completed boolean not null default false,
  done_at timestamptz,
  done_by uuid references public.users(id),
  meta jsonb,
  created_at timestamptz default now()
);

alter table public.task_checkpoints add column if not exists is_done boolean not null default false;
alter table public.task_checkpoints add column if not exists completed boolean not null default false;
alter table public.task_checkpoints add column if not exists sort_order int not null default 0;
alter table public.task_checkpoints add column if not exists done_at timestamptz;
alter table public.task_checkpoints add column if not exists done_by uuid references public.users(id);
alter table public.task_checkpoints add column if not exists meta jsonb;

create index if not exists task_checkpoints_task_idx on public.task_checkpoints(task_id);

alter table public.task_checkpoints enable row level security;
drop policy if exists "backend full access" on public.task_checkpoints;
create policy "backend full access" on public.task_checkpoints for all using (true) with check (true);

grant all on public.task_checkpoints to postgres, service_role, authenticated, anon;

notify pgrst, 'reload schema';
