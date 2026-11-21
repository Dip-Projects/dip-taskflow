-- Site active / inactive flag.
-- Inactive sites are hidden from every dropdown and listing in the system.
-- They are only shown on the Manage sites page.
-- Safe to run more than once.

alter table public.projects
  add column if not exists is_active boolean not null default true;

create index if not exists idx_projects_is_active on public.projects(is_active);
