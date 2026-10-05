-- WPR tables: columns the React WPR generator actually inserts
-- Supabase → SQL Editor → Run

create table if not exists public.wpr_reports (
  id uuid primary key default gen_random_uuid(),
  site_name text,
  engineer_name text,
  report_date text,
  report_number text,
  location text,
  status text,
  activities jsonb,
  next_week_plans jsonb,
  drawing_register_headers jsonb,
  drawing_register_data jsonb,
  office_activity_items jsonb,
  visitor_register_data jsonb,
  drawing_decision_data jsonb,
  delay_points jsonb,
  report_sections jsonb,
  submitted_by text,
  presentation_url text,
  site_image_url text,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- Add missing columns if table already existed with thin schema
alter table public.wpr_reports add column if not exists location text;
alter table public.wpr_reports add column if not exists status text;
alter table public.wpr_reports add column if not exists activities jsonb;
alter table public.wpr_reports add column if not exists next_week_plans jsonb;
alter table public.wpr_reports add column if not exists drawing_register_headers jsonb;
alter table public.wpr_reports add column if not exists drawing_register_data jsonb;
alter table public.wpr_reports add column if not exists office_activity_items jsonb;
alter table public.wpr_reports add column if not exists visitor_register_data jsonb;
alter table public.wpr_reports add column if not exists drawing_decision_data jsonb;
alter table public.wpr_reports add column if not exists delay_points jsonb;
alter table public.wpr_reports add column if not exists report_sections jsonb;
alter table public.wpr_reports add column if not exists submitted_by text;
alter table public.wpr_reports add column if not exists presentation_url text;
alter table public.wpr_reports add column if not exists site_image_url text;
-- report_date may be date type — allow text-like storage via cast-safe alter
do $$ begin
  alter table public.wpr_reports alter column report_date type text using report_date::text;
exception when others then null;
end $$;
do $$ begin
  alter table public.wpr_reports alter column report_number type text using report_number::text;
exception when others then null;
end $$;

create table if not exists public.wpr_drafts (
  id uuid primary key default gen_random_uuid(),
  site_name text,
  engineer_name text,
  payload jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.wpr_images (
  id uuid primary key default gen_random_uuid(),
  wpr_report_id uuid,
  image_type text,
  storage_path text,
  public_url text,
  caption text,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists public.site_details (
  id uuid primary key default gen_random_uuid(),
  site_name text unique,
  meta jsonb
);

alter table public.wpr_reports enable row level security;
drop policy if exists site_open_wpr_reports on public.wpr_reports;
create policy site_open_wpr_reports on public.wpr_reports for all using (true) with check (true);
grant select, insert, update, delete on public.wpr_reports to anon, authenticated;

alter table public.wpr_drafts enable row level security;
drop policy if exists site_open_wpr_drafts on public.wpr_drafts;
create policy site_open_wpr_drafts on public.wpr_drafts for all using (true) with check (true);
grant select, insert, update, delete on public.wpr_drafts to anon, authenticated;

alter table public.wpr_images enable row level security;
drop policy if exists site_open_wpr_images on public.wpr_images;
create policy site_open_wpr_images on public.wpr_images for all using (true) with check (true);
grant select, insert, update, delete on public.wpr_images to anon, authenticated;

alter table public.site_details enable row level security;
drop policy if exists site_open_site_details on public.site_details;
create policy site_open_site_details on public.site_details for all using (true) with check (true);
grant select, insert, update, delete on public.site_details to anon, authenticated;

notify pgrst, 'reload schema';
