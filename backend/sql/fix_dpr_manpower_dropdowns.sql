-- =====================================================================
-- Fix DPR Manpower dropdowns + missing tables (Site Engineer)
-- Supabase → SQL Editor → paste → Run
-- =====================================================================

-- ---- Missing tables ----
create table if not exists public.material_requirements (
  id uuid primary key default gen_random_uuid(),
  material_name text,
  unit_name text,
  quantity numeric,
  site_name text,
  requested_by text,
  status text default 'pending',
  created_at timestamptz not null default now()
);

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

create table if not exists public.leave_seen_status (
  user_name text primary key,
  snapshot jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.dpr_skills (
  id bigserial primary key,
  name text unique not null
);

create table if not exists public.dpr_scopes (
  id bigserial primary key,
  name text unique not null
);

create table if not exists public.manpower (
  id bigserial primary key,
  scope text not null,
  manpowertype text not null,
  created_at timestamptz default now()
);

create table if not exists public.man_type (
  id bigserial primary key,
  category text,
  manpowertype text,
  created_at timestamptz default now()
);

create table if not exists public.workcategory (
  id bigserial primary key,
  category text unique,
  created_at timestamptz default now()
);

create table if not exists public.dpr_equipment (
  id bigserial primary key,
  name text,
  meta jsonb,
  created_at timestamptz default now()
);

create table if not exists public.dpr_units (
  id bigserial primary key,
  name text unique
);

-- ---- Seed master dropdown data (skip if already there) ----
insert into public.dpr_scopes (name) values
  ('CLIENT'), ('PMC'), ('CONTRACTOR')
on conflict (name) do nothing;

insert into public.dpr_skills (name) values
  ('Skilled'), ('Semi-skilled'), ('Unskilled')
on conflict (name) do nothing;

insert into public.dpr_units (name) values
  ('Nos'), ('Kg'), ('Ton'), ('Cum'), ('Sqm'), ('Rmt'), ('Litre'), ('Bag')
on conflict (name) do nothing;

-- Common manpower types by scope (only insert if that type not already for scope)
insert into public.manpower (scope, manpowertype)
select v.scope, v.manpowertype
from (values
  ('contractor', 'Mason'),
  ('contractor', 'Helper'),
  ('contractor', 'Carpenter'),
  ('contractor', 'Barbender'),
  ('contractor', 'Electrician'),
  ('contractor', 'Plumber'),
  ('contractor', 'Painter'),
  ('contractor', 'Welder'),
  ('contractor', 'Supervisor'),
  ('client', 'Client Representative'),
  ('client', 'Client Engineer'),
  ('pmc', 'PMC Engineer'),
  ('pmc', 'PMC Supervisor')
) as v(scope, manpowertype)
where not exists (
  select 1 from public.manpower m
  where lower(m.scope) = lower(v.scope)
    and lower(m.manpowertype) = lower(v.manpowertype)
);

insert into public.workcategory (category)
select v.category from (values
  ('Civil'), ('Structural'), ('Finishing'), ('MEP'), ('External Development')
) as v(category)
where not exists (
  select 1 from public.workcategory w where lower(w.category) = lower(v.category)
);

-- Link some types to categories (contractor filter)
insert into public.man_type (category, manpowertype)
select v.category, v.manpowertype
from (values
  ('Civil', 'Mason'),
  ('Civil', 'Helper'),
  ('Structural', 'Barbender'),
  ('Structural', 'Welder'),
  ('Finishing', 'Painter'),
  ('Finishing', 'Carpenter'),
  ('MEP', 'Electrician'),
  ('MEP', 'Plumber')
) as v(category, manpowertype)
where not exists (
  select 1 from public.man_type t
  where lower(t.category) = lower(v.category)
    and lower(t.manpowertype) = lower(v.manpowertype)
);

-- ---- Grants + RLS so anon key (Site React) can read/write ----
do $$
declare
  t text;
begin
  foreach t in array array[
    'material_requirements','site_leaves','leave_seen_status',
    'dpr_skills','dpr_scopes','manpower','man_type','workcategory',
    'dpr_equipment','dpr_units','dpr_reports','dpr_drafts',
    'attendance','wpr_reports','wpr_drafts','wpr_images',
    'site_reports','svr_drafts','site_details','user_site_assignments'
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
      raise notice 'skip missing table %', t;
    when others then
      raise notice 'skip % : %', t, sqlerrm;
    end;
  end loop;
end $$;

-- sequences for bigserial tables
grant usage, select on all sequences in schema public to anon, authenticated;

grant select on public.site_user_details to anon, authenticated;

notify pgrst, 'reload schema';
