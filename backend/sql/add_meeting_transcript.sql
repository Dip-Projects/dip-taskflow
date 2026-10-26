-- Spoken call captions for MoM (run in Supabase SQL Editor)

alter table public.meeting_moms
  add column if not exists live_transcript text default '';

notify pgrst, 'reload schema';
