-- Fix Site Visit + storage for Site Engineer
-- Supabase → SQL Editor → Run ALL

-- 1) site_reports
create table if not exists public.site_reports (
  id uuid primary key default gen_random_uuid(),
  visit_date date,
  visit_time text,
  site_name text,
  reporter_name text,
  designation text,
  progress_of_work text,
  quality_observations text,
  safety_concerns text,
  issues_concerns text,
  site_visit_instructions text,
  key_instructions text,
  submitted_by text,
  submitted_by_name text,
  pdf_url text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_site_reports_site_date
  on public.site_reports (site_name, visit_date);

-- 2) svr drafts
create table if not exists public.svr_drafts (
  id uuid primary key default gen_random_uuid(),
  site_name text,
  reporter text,
  payload jsonb,
  saved_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- unique pair for upsert (ignore if constraint already exists)
do $$ begin
  alter table public.svr_drafts
    add constraint svr_drafts_site_reporter_uq unique (site_name, reporter);
exception when duplicate_table or duplicate_object then null;
end $$;

-- 3) Table grants + RLS open for anon (Site React)
alter table public.site_reports enable row level security;
drop policy if exists site_open_site_reports on public.site_reports;
create policy site_open_site_reports on public.site_reports for all using (true) with check (true);
grant select, insert, update, delete on public.site_reports to anon, authenticated;

alter table public.svr_drafts enable row level security;
drop policy if exists site_open_svr_drafts on public.svr_drafts;
create policy site_open_svr_drafts on public.svr_drafts for all using (true) with check (true);
grant select, insert, update, delete on public.svr_drafts to anon, authenticated;

-- 4) Storage policies for site-files / attendance-photos / documents
-- (in case any client-side upload still hits Storage directly)
insert into storage.buckets (id, name, public)
values ('site-files', 'site-files', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('attendance-photos', 'attendance-photos', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do update set public = true;

drop policy if exists "site_files_select" on storage.objects;
drop policy if exists "site_files_insert" on storage.objects;
drop policy if exists "site_files_update" on storage.objects;
drop policy if exists "site_files_delete" on storage.objects;

create policy "site_files_select" on storage.objects
  for select to public using (bucket_id in ('site-files','attendance-photos','documents'));
create policy "site_files_insert" on storage.objects
  for insert to public with check (bucket_id in ('site-files','attendance-photos','documents'));
create policy "site_files_update" on storage.objects
  for update to public using (bucket_id in ('site-files','attendance-photos','documents'));
create policy "site_files_delete" on storage.objects
  for delete to public using (bucket_id in ('site-files','attendance-photos','documents'));

notify pgrst, 'reload schema';
