-- Add half-day support to the site leave workflow.
alter table public.site_leaves
  add column if not exists is_half_day boolean not null default false;

alter table public.site_leaves
  add column if not exists half_day_period text;

alter table public.leaves
  add column if not exists half_day_period text;
