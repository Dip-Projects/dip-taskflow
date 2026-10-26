-- Common checkpoints shown at the top of every task checklist (e.g. Project Name,
-- Drawing Date, Reviewer Name, Date of Review). Run after task_checklists.sql.
-- Run in Supabase → SQL Editor. Safe to re-run.

create table if not exists public.task_checklist_common_items (
  id uuid primary key default gen_random_uuid(),
  item_text text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_checklist_common_items_order_idx
  on public.task_checklist_common_items(sort_order);

-- Answers to common checkpoints are stored in task_checklists, pointing here.
alter table public.task_checklists
  add column if not exists common_item_id uuid
  references public.task_checklist_common_items(id) on delete set null;

create index if not exists task_checklists_common_item_idx
  on public.task_checklists(common_item_id);

alter table public.task_checklist_common_items enable row level security;
drop policy if exists "backend full access" on public.task_checklist_common_items;
create policy "backend full access" on public.task_checklist_common_items for all using (true) with check (true);

grant all on public.task_checklist_common_items to postgres, service_role, authenticated, anon;

notify pgrst, 'reload schema';
