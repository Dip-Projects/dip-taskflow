-- site_details was created with only (id, site_name, meta), but the WPR
-- generator and the client portal read real columns off it. Missing columns
-- made PostgREST answer 400 "Could not find the 'site_image_url' column".
-- Safe to run more than once.

create table if not exists public.site_details (
  id uuid primary key default gen_random_uuid(),
  site_name text unique,
  meta jsonb
);

alter table public.site_details add column if not exists site_image_url text;
alter table public.site_details add column if not exists job_no text;
alter table public.site_details add column if not exists client_name text;
alter table public.site_details add column if not exists head_name text;
alter table public.site_details add column if not exists head_contact_no text;
alter table public.site_details add column if not exists incharge_name text;
alter table public.site_details add column if not exists incharge_contact_no text;
alter table public.site_details add column if not exists pc_name text;
alter table public.site_details add column if not exists pc_contact_no text;
alter table public.site_details add column if not exists status text;
alter table public.site_details add column if not exists updated_at timestamptz default now();

create unique index if not exists site_details_site_name_key
  on public.site_details (site_name);

alter table public.site_details enable row level security;
drop policy if exists site_open_site_details on public.site_details;
create policy site_open_site_details on public.site_details
  for all using (true) with check (true);
grant select, insert, update, delete on public.site_details to anon, authenticated;

notify pgrst, 'reload schema';
