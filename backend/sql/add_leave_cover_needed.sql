-- Unresolved leave cover when buddy declines but leave is approved
-- Run once in Supabase SQL Editor

alter table public.leaves
  add column if not exists cover_needed boolean default false,
  add column if not exists cover_resolved_at timestamptz;

notify pgrst, 'reload schema';
