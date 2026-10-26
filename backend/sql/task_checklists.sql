-- Task checklists (verification checklist per task type).
-- Run in Supabase → SQL Editor. Safe to re-run.
--
-- Masters (editable by admin, per task type):
--   task_checklist_sections  → headings such as "A. General Information & Setup"
--   task_checklist_items     → checkpoints under a section
--
-- Records (written when a verifier approves a task):
--   task_checklist_submissions → one row per verification (who, which task, when)
--   task_checklists            → one row per checkpoint answered in that submission
--                                 (task_type_id, section_id, checklist_item, comments)
--
-- checklist_item / section_title on task_checklists are snapshots, so a record
-- still reads correctly after the master section or item is renamed or deleted.

-- ---------------------------------------------------------------- masters

create table if not exists public.task_checklist_sections (
  id uuid primary key default gen_random_uuid(),
  task_type_id uuid not null references public.task_types(id) on delete cascade,
  title text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_checklist_sections_type_idx
  on public.task_checklist_sections(task_type_id, sort_order);

create table if not exists public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.task_checklist_sections(id) on delete cascade,
  item_text text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_checklist_items_section_idx
  on public.task_checklist_items(section_id, sort_order);

-- ---------------------------------------------------------------- records

create table if not exists public.task_checklist_submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  task_type_id uuid references public.task_types(id) on delete set null,
  verifier_id uuid references public.users(id) on delete set null,
  verifier_name text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists task_checklist_submissions_task_idx
  on public.task_checklist_submissions(task_id);
create index if not exists task_checklist_submissions_type_idx
  on public.task_checklist_submissions(task_type_id, submitted_at desc);

create table if not exists public.task_checklists (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.task_checklist_submissions(id) on delete cascade,
  task_type_id uuid references public.task_types(id) on delete set null,
  section_id uuid references public.task_checklist_sections(id) on delete set null,
  item_id uuid references public.task_checklist_items(id) on delete set null,
  section_title text not null default '',
  checklist_item text not null,
  comments text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists task_checklists_submission_idx
  on public.task_checklists(submission_id, sort_order);

-- ---------------------------------------------------------------- access
-- Same pattern as the other backend tables: the API uses the service role and
-- enforces auth itself, so RLS is on with a permissive backend policy.

alter table public.task_checklist_sections enable row level security;
alter table public.task_checklist_items enable row level security;
alter table public.task_checklist_submissions enable row level security;
alter table public.task_checklists enable row level security;

drop policy if exists "backend full access" on public.task_checklist_sections;
create policy "backend full access" on public.task_checklist_sections for all using (true) with check (true);
drop policy if exists "backend full access" on public.task_checklist_items;
create policy "backend full access" on public.task_checklist_items for all using (true) with check (true);
drop policy if exists "backend full access" on public.task_checklist_submissions;
create policy "backend full access" on public.task_checklist_submissions for all using (true) with check (true);
drop policy if exists "backend full access" on public.task_checklists;
create policy "backend full access" on public.task_checklists for all using (true) with check (true);

grant all on public.task_checklist_sections to postgres, service_role, authenticated, anon;
grant all on public.task_checklist_items to postgres, service_role, authenticated, anon;
grant all on public.task_checklist_submissions to postgres, service_role, authenticated, anon;
grant all on public.task_checklists to postgres, service_role, authenticated, anon;

notify pgrst, 'reload schema';
