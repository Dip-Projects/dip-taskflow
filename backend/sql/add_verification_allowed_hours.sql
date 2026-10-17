-- Verifier chooses how many hours the verification will take when starting it.
-- Overdue is measured from verification_started_at + this many working hours.
-- Run once in Supabase SQL editor.
alter table public.tasks add column if not exists verification_allowed_hours numeric;
