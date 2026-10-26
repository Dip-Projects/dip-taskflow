-- WPR draft columns used by frontend/src/pages/site/Wprgenerator.jsx (manual Save Draft,
-- autosave every 20 seconds, and Load draft). The earlier wpr_drafts table only had a
-- single "payload" column, so saving fails with "Could not find the 'activities' column".
-- Run in Supabase → SQL Editor. Safe to re-run.

alter table public.wpr_drafts add column if not exists updated_at timestamptz default now();
alter table public.wpr_drafts add column if not exists location text;
alter table public.wpr_drafts add column if not exists report_date text;
alter table public.wpr_drafts add column if not exists report_number int;
alter table public.wpr_drafts add column if not exists visitor_mode text;
alter table public.wpr_drafts add column if not exists activities jsonb;
alter table public.wpr_drafts add column if not exists next_week_plans jsonb;
alter table public.wpr_drafts add column if not exists drawing_register_headers jsonb;
alter table public.wpr_drafts add column if not exists drawing_register_data jsonb;
alter table public.wpr_drafts add column if not exists office_activity_items jsonb;
alter table public.wpr_drafts add column if not exists visitor_register_data jsonb;
alter table public.wpr_drafts add column if not exists drawing_decision_data jsonb;
alter table public.wpr_drafts add column if not exists delay_points jsonb;
alter table public.wpr_drafts add column if not exists visitor_photos jsonb;
alter table public.wpr_drafts add column if not exists report_sections jsonb;
alter table public.wpr_drafts add column if not exists barchart_header jsonb;
alter table public.wpr_drafts add column if not exists cube_header jsonb;
alter table public.wpr_drafts add column if not exists mom_header jsonb;

-- One draft per site and engineer. Keep the newest if duplicates already exist.
delete from public.wpr_drafts d
using public.wpr_drafts newer
where d.site_name is not distinct from newer.site_name
  and d.engineer_name is not distinct from newer.engineer_name
  and (d.updated_at, d.id) < (newer.updated_at, newer.id);

create unique index if not exists wpr_drafts_site_engineer_key
  on public.wpr_drafts (site_name, engineer_name);

notify pgrst, 'reload schema';
