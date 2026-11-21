-- 1) New per-user switches
--    default_site_portal     = after login, open the Site portal (not Office)
--    can_view_team_overview  = shows "Team Overview" page in the Site portal
-- Run once in Supabase → SQL Editor. Safe to re-run.
alter table public.users add column if not exists default_site_portal boolean not null default false;
alter table public.users add column if not exists can_view_team_overview boolean not null default false;

-- 2) First CHECK who will be switched on (should show exactly Divyesh and Jignesh):
select id, username, full_name, designation, role, is_head, reporting_head_id
from public.users
where full_name ilike 'divyesh%rana%' or full_name ilike 'jignesh%lad%'
   or lower(username) in ('divyesh.r', 'jignesh.l');

-- 3) Switch ON for them (also lets them open the Site portal and come back to Office)
update public.users
set default_site_portal = true,
    can_view_team_overview = true,
    can_switch_office_site = true
where full_name ilike 'divyesh%rana%' or full_name ilike 'jignesh%lad%'
   or lower(username) in ('divyesh.r', 'jignesh.l');

notify pgrst, 'reload schema';
