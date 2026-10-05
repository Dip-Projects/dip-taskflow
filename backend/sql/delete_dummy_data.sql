-- =====================================================================
-- WIPE ALL CURRENT (DUMMY) APP DATA — keep logins only
-- Supabase → SQL Editor → paste PART B → Run
--
-- YE SCRIPT TABLES DELETE NAHI KARTI (structure same rahega)
--
-- RAHEGA (KEEP):
--   • users          → username + password / id (login)
--   • departments    → Engg / MDO etc master list
--
-- JAYEGA (DELETE ALL ROWS — abhi sab dummy maan ke):
--   • tasks (+ checkpoints)     → My Tasks / Overdue / All Tasks
--   • recurring_*               → Recurring tasks + ticks
--   • tickets, leaves
--   • projects + project_members → Manage sites
--   • task_types (+ templates)
--   • dpr_*, wpr_*, monthly_*, site_reports, site_details, drawings
--   • chat_*, bot_*, meeting_moms, attendance, manpower, …
--
-- TRUNCATE = table empty, table itself NOT dropped
-- =====================================================================

-- ───────── PART A — pehle counts dekho (safe) ─────────
select 'users' as tbl, count(*) from public.users
union all select 'tasks', count(*) from public.tasks
union all select 'projects', count(*) from public.projects
union all select 'recurring_tasks', count(*) from public.recurring_tasks
union all select 'dpr_reports', count(*) from public.dpr_reports
union all select 'wpr_reports', count(*) from public.wpr_reports
union all select 'tickets', count(*) from public.tickets
union all select 'leaves', count(*) from public.leaves
order by 1;


-- ───────── PART B — RUN THIS (users KEPT) ─────────
/*
begin;

-- Clear project refs on users (text/FK) so sites can be wiped
update public.users
set site_name = null
where site_name is not null;

-- Null project role FKs if columns exist (ignore if already null)
update public.projects
set team_leader_id = null,
    coordinator_id = null,
    site_incharge_id = null,
    pc_id = null;

-- Wipe operational tables (NOT users, NOT departments)
-- CASCADE clears dependent rows in FK order
truncate table
  public.recurring_task_checkpoint_completions,
  public.recurring_task_instances,
  public.recurring_task_checkpoints,
  public.recurring_tasks,
  public.task_checkpoints,
  public.overdue_wa_log,
  public.tickets,
  public.leaves,
  public.leave_seen_status,
  public.tasks,
  public.task_type_checkpoint_templates,
  public.task_types,
  public.project_members,
  public.drawings,
  public.monthly_reports,
  public.dpr_reports,
  public.dpr_drafts,
  public.wpr_images,
  public.wpr_reports,
  public.wpr_drafts,
  public.site_reports,
  public.svr_drafts,
  public.site_details,
  public.site_leaves,
  public.attendance,
  public.manpower,
  public.material_requirements,
  public.user_site_assignments,
  public.chat_messages,
  public.chat_room_members,
  public.chat_rooms,
  public.bot_alerts,
  public.bot_qa,
  public.meeting_moms,
  public.projects
restart identity cascade;

-- users + departments untouched

commit;
*/
