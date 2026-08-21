-- =====================================================================
-- REMOVE DUMMY / TEST DATA (not only employees — everything dummy)
-- Supabase → SQL Editor → Run
--
-- SAFE RULES:
--   • Real staff (chirag.s, charmy, viral.l, …) are NOT deleted
--   • Edit the lists below if a name is real and should stay
--   • Run PART A (preview) first, check counts, then PART B (delete)
-- =====================================================================

-- ───────── PART A — PREVIEW (safe, no deletes) ─────────

-- Dummy clients (Manage clients / portal test logins)
select id, username, full_name, department, role, site_name
from public.users
where
  lower(coalesce(role, '')) = 'client'
  or lower(coalesce(department, '')) = 'client'
  or lower(coalesce(designation, '')) = 'client'
  or lower(username) in (
    'client.demo', 'div', 'zxc', 'abc', 'tht', 'df', 'demo', 'test', 'test.client'
  )
  or lower(full_name) in ('demo client', 'div', 'zxc', 'abc', 'tht')
  or lower(full_name) like 'demo %'
order by created_at desc;

-- Dummy / test sites (edit list if SMJV / Cafe are REAL — then remove them from this list)
select id, name, client_name, status, created_at
from public.projects
where lower(name) in (
  'site01', 'site 01', 'site1', 'test site', 'dummy site', 'internal support'
  -- uncomment ONLY if these are demo, not live sites:
  -- , 'proposed cafe project', 'smjv boys hostel'
)
order by created_at desc;

-- Dummy task types (keyboard-test names)
select id, name
from public.task_types
where lower(name) in ('abc', 'df', 'frg', 'test', 'dummy', 'xxx');

-- Garbage tasks (very short / nonsense descriptions — REVIEW carefully)
select id, description, status, created_at
from public.tasks
where
  length(trim(description)) <= 4
  or lower(trim(description)) ~ '^(sdf|fgf|dfd|fgdg|df|sd|er|rt|hj|asd|yujh|gfh|dfsdf|dfds|fgdf|fgdfg|cehcking|timing|dummy|test|xxx|asd|sdfsd)$'
order by created_at desc
limit 200;

-- Seed admin (optional dummy)
select id, username, full_name, role
from public.users
where lower(username) = 'admin' and lower(full_name) = 'admin user';


-- ───────── PART B — DELETE (run after preview looks correct) ─────────
-- Uncomment the block below when ready.

/*
begin;

-- 1) Collect dummy user ids (clients + seed admin)
create temporary table _dummy_users as
select id from public.users
where
  lower(coalesce(role, '')) = 'client'
  or lower(coalesce(department, '')) = 'client'
  or lower(coalesce(designation, '')) = 'client'
  or lower(username) in (
    'client.demo', 'div', 'zxc', 'abc', 'tht', 'df', 'demo', 'test', 'test.client'
  )
  or lower(full_name) in ('demo client', 'div', 'zxc', 'abc', 'tht')
  or lower(full_name) like 'demo %'
  or (lower(username) = 'admin' and lower(full_name) = 'admin user');

-- 2) Collect dummy project ids
create temporary table _dummy_projects as
select id, name from public.projects
where lower(name) in (
  'site01', 'site 01', 'site1', 'test site', 'dummy site', 'internal support'
  -- , 'proposed cafe project', 'smjv boys hostel'
);

-- 3) Collect dummy task type ids
create temporary table _dummy_task_types as
select id from public.task_types
where lower(name) in ('abc', 'df', 'frg', 'test', 'dummy', 'xxx');

-- 4) Collect garbage + project-linked tasks
create temporary table _dummy_tasks as
select id from public.tasks
where
  project_id in (select id from _dummy_projects)
  or length(trim(description)) <= 4
  or lower(trim(description)) ~ '^(sdf|fgf|dfd|fgdg|df|sd|er|rt|hj|asd|yujh|gfh|dfsdf|dfds|fgdf|fgdfg|cehcking|timing|dummy|test|xxx|asd|sdfsd)$'
  or assigned_to in (select id from _dummy_users)
  or assigned_by in (select id from _dummy_users);

-- ---- child rows first ----
-- (use task_checkpoints only — public.checkpoints does not exist in this DB)
delete from public.task_checkpoints
where task_id in (select id from _dummy_tasks);

delete from public.overdue_wa_log
where task_id in (select id from _dummy_tasks);

-- tickets may FK to tasks — remove before task delete
delete from public.tickets
where task_id in (select id from _dummy_tasks)
   or raised_by in (select id from _dummy_users);

delete from public.tasks
where id in (select id from _dummy_tasks);

-- recurring linked to dummy projects / users
-- completions use instance_id (not recurring_task_id)
create temporary table _dummy_recurring as
select id from public.recurring_tasks
where project_id in (select id from _dummy_projects)
   or assigned_to in (select id from _dummy_users);

delete from public.recurring_task_checkpoint_completions
where instance_id in (
  select id from public.recurring_task_instances
  where recurring_task_id in (select id from _dummy_recurring)
)
   or checkpoint_id in (
  select id from public.recurring_task_checkpoints
  where recurring_task_id in (select id from _dummy_recurring)
);

delete from public.recurring_task_instances
where recurring_task_id in (select id from _dummy_recurring);

delete from public.recurring_task_checkpoints
where recurring_task_id in (select id from _dummy_recurring);

delete from public.recurring_tasks
where id in (select id from _dummy_recurring);

-- tickets / leaves tied to dummy users (tickets for dummy tasks already deleted above)
delete from public.leaves where user_id in (select id from _dummy_users);

-- drawings / monthly for dummy projects
delete from public.drawings
where project_id in (select id from _dummy_projects);

delete from public.monthly_reports
where lower(coalesce(project_name, '')) in (select lower(name) from _dummy_projects)
   or lower(coalesce(site_name, '')) in (select lower(name) from _dummy_projects);

-- site portal rows for dummy site names
delete from public.dpr_reports
where lower(coalesce(site, '')) in (select lower(name) from _dummy_projects);

delete from public.wpr_images
where wpr_report_id in (
  select id from public.wpr_reports
  where lower(coalesce(site_name, '')) in (select lower(name) from _dummy_projects)
);

delete from public.wpr_reports
where lower(coalesce(site_name, '')) in (select lower(name) from _dummy_projects);

delete from public.site_reports
where lower(coalesce(site_name, '')) in (select lower(name) from _dummy_projects);

delete from public.site_details
where lower(coalesce(site_name, '')) in (select lower(name) from _dummy_projects);

delete from public.project_members
where project_id in (select id from _dummy_projects)
   or user_id in (select id from _dummy_users);

-- task type junk (clear FKs on any remaining tasks / recurring first)
update public.tasks
set task_type_id = null
where task_type_id in (select id from _dummy_task_types);

update public.recurring_tasks
set task_type_id = null
where task_type_id in (select id from _dummy_task_types);

delete from public.task_type_checkpoint_templates
where task_type_id in (select id from _dummy_task_types);

delete from public.task_types
where id in (select id from _dummy_task_types);

-- clear FK refs on projects before delete
-- any leftover tasks still pointing at dummy projects
update public.tasks
set project_id = null
where project_id in (select id from _dummy_projects);

update public.projects
set team_leader_id = null, coordinator_id = null, site_incharge_id = null, pc_id = null
where id in (select id from _dummy_projects);

delete from public.projects
where id in (select id from _dummy_projects);

-- finally dummy users (clients / seed admin)
update public.users set reporting_head_id = null
where reporting_head_id in (select id from _dummy_users);

delete from public.users
where id in (select id from _dummy_users);

commit;
*/

notify pgrst, 'reload schema';
