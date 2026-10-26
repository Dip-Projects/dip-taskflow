-- =====================================================================
-- Site portal tables missing in TaskFlow Supabase (404 / 400 on DPR page)
-- Run once in Supabase → SQL Editor → Run
-- =====================================================================

-- Material requirements (columns match MatRequirement.jsx + Dpr.jsx)
create table if not exists public.material_requirements (
  id uuid primary key default gen_random_uuid(),
  material_name text,
  unit_name text,
  quantity numeric,
  site_name text,
  requested_by text,
  status text default 'pending',
  received_at timestamptz,
  received_by text,
  rejected_at timestamptz,
  rejected_by text,
  rejection_reason text,
  created_at timestamptz not null default now()
);

alter table public.material_requirements add column if not exists material_name text;
alter table public.material_requirements add column if not exists unit_name text;
alter table public.material_requirements add column if not exists quantity numeric;
alter table public.material_requirements add column if not exists site_name text;
alter table public.material_requirements add column if not exists requested_by text;
alter table public.material_requirements add column if not exists status text;
alter table public.material_requirements add column if not exists received_at timestamptz;
alter table public.material_requirements add column if not exists received_by text;
alter table public.material_requirements add column if not exists rejected_at timestamptz;
alter table public.material_requirements add column if not exists rejected_by text;
alter table public.material_requirements add column if not exists rejection_reason text;
alter table public.material_requirements add column if not exists created_at timestamptz;

update public.material_requirements set status = 'pending' where status is null;
update public.material_requirements set created_at = now() where created_at is null;

-- Site leaves
create table if not exists public.site_leaves (
  id uuid primary key default gen_random_uuid(),
  user_name text not null,
  name text,
  leave_type text,
  from_date date not null,
  to_date date not null,
  reason text,
  site_name text,
  level_approver_user_name text,
  level_approver_name text,
  level_approver_role text,
  level_approved boolean,
  head_approver_user_name text,
  head_approver_name text,
  head_approver_role text,
  head_approved boolean,
  status text default 'pending',
  rejection_reason text,
  created_at timestamptz not null default now()
);

-- Leave badge snapshot
create table if not exists public.leave_seen_status (
  user_name text primary key,
  snapshot jsonb,
  updated_at timestamptz not null default now()
);

-- Site assignments (no FK to user_details — TaskFlow uses users table)
create table if not exists public.user_site_assignments (
  id uuid primary key default gen_random_uuid(),
  user_name text,
  full_name text,
  site_name text,
  unique (user_name, site_name)
);

alter table public.user_site_assignments add column if not exists full_name text;

-- DPR core (if still missing)
create table if not exists public.dpr_reports (
  id uuid primary key default gen_random_uuid(),
  site text,
  engineer text,
  report_type text,
  date date,
  payload jsonb,
  pdf_url text,
  photo_folder text,
  created_at timestamptz not null default now()
);

create table if not exists public.dpr_drafts (
  id uuid primary key default gen_random_uuid(),
  site text,
  engineer text,
  payload jsonb,
  saved_at timestamptz not null default now()
);

-- Open RLS for Site React (anon key)
do $$
declare
  t text;
begin
  foreach t in array array[
    'material_requirements',
    'site_leaves',
    'leave_seen_status',
    'user_site_assignments',
    'dpr_reports',
    'dpr_drafts'
  ]
  loop
    begin
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists site_open_%I on public.%I', t, t);
      execute format(
        'create policy site_open_%I on public.%I for all using (true) with check (true)',
        t, t
      );
      execute format(
        'grant select, insert, update, delete on public.%I to anon, authenticated',
        t
      );
    exception when undefined_table then
      raise notice 'skip missing %', t;
    when others then
      raise notice 'skip % : %', t, sqlerrm;
    end;
  end loop;
end $$;

-- Also ensure site_user_details view exists for Site portal refresh
create or replace view public.site_user_details as
select
  u.id,
  u.username,
  u.full_name as name,
  u.department,
  coalesce(nullif(trim(u.designation), ''), u.role) as role,
  case when u.is_active then 'Active' else 'Inactive' end as status,
  u.site_name,
  u.site_names,
  u.created_at,
  u.is_head,
  null::text as password
from public.users u;

grant select on public.site_user_details to anon, authenticated;

notify pgrst, 'reload schema';
