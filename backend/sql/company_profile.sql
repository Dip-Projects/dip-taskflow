-- Company details printed at the top of checklist PDFs.
-- Single row (id = 1). Shown only in the PDF, never as an editable form in the UI.
-- Values are the letterhead details used on the HR salary slip.
-- To change them later: Supabase → Table Editor, or PUT /api/task-checklists/company.
-- Run in Supabase → SQL Editor. Safe to re-run: it only fills fields that are still empty.

create table if not exists public.company_profile (
  id int primary key default 1 check (id = 1),
  company_name text,
  tagline text,
  address text,
  phone text,
  email text,
  website text,
  gst_no text,
  updated_at timestamptz not null default now()
);

alter table public.company_profile add column if not exists tagline text;

insert into public.company_profile (id, company_name, tagline, address, phone, email, website)
values (
  1,
  'Dip Projects',
  'Civil Project Management Consultant',
  '407/A, Trinity Business Park, L.P Savani Road, Adajan, Surat-395009.',
  '+91 98253 44040',
  'dipprojects2008@gmail.com · office.dipprojects@gmail.com',
  'www.dipprojects.com'
)
on conflict (id) do update set
  company_name = coalesce(public.company_profile.company_name, excluded.company_name),
  tagline      = coalesce(public.company_profile.tagline, excluded.tagline),
  address      = coalesce(public.company_profile.address, excluded.address),
  phone        = coalesce(public.company_profile.phone, excluded.phone),
  email        = coalesce(public.company_profile.email, excluded.email),
  website      = coalesce(public.company_profile.website, excluded.website);

alter table public.company_profile enable row level security;
drop policy if exists "backend full access" on public.company_profile;
create policy "backend full access" on public.company_profile for all using (true) with check (true);

grant all on public.company_profile to postgres, service_role, authenticated, anon;

notify pgrst, 'reload schema';
