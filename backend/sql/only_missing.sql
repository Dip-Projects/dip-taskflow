-- =====================================================================
-- ONLY what's still missing on your TaskFlow DB
-- (dpr_*, manpower, attendance, site_leaves, etc. already exist — skip those)
-- Run this in Supabase → SQL Editor → Run
-- =====================================================================

-- 1) Head toggle + site fields on users
alter table users add column if not exists is_head boolean not null default false;
alter table users add column if not exists site_name text;
alter table users add column if not exists site_names jsonb;

-- 2) Site Engineer department (you already have "Site" — this adds the exact name the app checks)
insert into departments (name)
values ('Site Engineer')
on conflict (name) do nothing;

-- 3) View so Site React pages can read user info (no password)
create or replace view site_user_details as
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
from users u;

grant select on site_user_details to anon, authenticated;

-- 4) Example: mark a head (CHANGE username)
-- update users set is_head = true where username = 'chirag.s';
