-- Official office holidays shown on the HR dashboard calendar.
-- Run once in Supabase SQL editor.

create table if not exists public.office_holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  title text not null,
  created_at timestamptz not null default now()
);

alter table public.office_holidays enable row level security;
