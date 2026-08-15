-- If a half-created table exists from a partial run, replace it.
drop table if exists public.monthly_reports;

create table public.monthly_reports (
  id uuid primary key default gen_random_uuid(),
  month int not null,
  year int not null,
  project_name text not null,
  site_name text,
  submitted_by text,
  submitted_by_name text,
  folder_path text,
  folder_url text,
  file_count int default 0,
  total_bytes bigint default 0,
  created_at timestamptz default now()
);

create index if not exists monthly_reports_created_idx
  on public.monthly_reports (created_at desc);

create index if not exists monthly_reports_project_idx
  on public.monthly_reports (project_name, year, month);

notify pgrst, 'reload schema';
