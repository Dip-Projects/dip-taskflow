-- Fix Supabase email: "Table publicly accessible" (rls_disabled_in_public)
-- Project: dip-projects
--
-- Supabase → SQL Editor → New query → paste this whole file → Run
-- Safe to re-run.

-- 1) Turn RLS on for every public table.
--    Office backend uses the service_role key, which bypasses RLS — TaskFlow keeps working.
--    The website anon key can no longer read/edit a table unless that table already
--    has an explicit policy (Site DPR / WPR / attendance already do).
do $$
declare r record;
begin
  for r in
    select c.relname as t
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
  loop
    execute format('alter table public.%I enable row level security', r.t);
  end loop;
end $$;

-- 2) Lock the users table against public writes (passwords / roles).
--    Site + MDO only need to READ names/sites — not password_hash.
revoke all on table public.users from anon, authenticated;

do $$
declare cols text;
begin
  select string_agg(format('%I', c.column_name), ', ')
    into cols
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'users'
    and c.column_name in (
      'id', 'username', 'full_name', 'department', 'designation',
      'role', 'is_active', 'is_head', 'site_name', 'site_names'
    );
  if cols is not null then
    execute format('grant select (%s) on table public.users to anon, authenticated', cols);
  end if;
end $$;

drop policy if exists "users_anon_select" on public.users;
create policy "users_anon_select"
  on public.users
  for select
  to anon, authenticated
  using (true);

-- 3) Tables the Site / MDO screens still call with the public anon key.
--    RLS is on (email goes away). These policies keep those screens working.
--    Do not copy this pattern onto password / task / ticket tables.
do $$
declare
  t text;
  site_tables text[] := array[
    'projects',
    'attendance',
    'site_leaves',
    'leave_seen_status',
    'dpr_reports',
    'dpr_drafts',
    'wpr_reports',
    'wpr_drafts',
    'wpr_images',
    'site_reports',
    'svr_drafts',
    'site_details',
    'material_requirements',
    'task_submissions',
    'monthly_reports',
    'drawings',
    'leaves',
    'man_type',
    'manpower',
    'workcategory',
    'dpr_skills',
    'dpr_units',
    'dpr_scopes',
    'dpr_materials',
    'dpr_equipment',
    'dpr_equipment_units',
    'dpr_engineers',
    'dpr_sites',
    'dpr_manpower_types',
    'user_site_assignments',
    'user_details'
  ];
begin
  foreach t in array site_tables loop
    if exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname = t
    ) then
      execute format('drop policy if exists "rls_fix_site_%I" on public.%I', t, t);
      execute format(
        'create policy "rls_fix_site_%I" on public.%I for all to anon, authenticated using (true) with check (true)',
        t, t
      );
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
