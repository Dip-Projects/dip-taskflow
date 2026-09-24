-- Fix: dpr_reports_pkey duplicate on NEW inserts when the id sequence
-- is behind MAX(id). Run once in Supabase → SQL Editor.

SELECT setval(
  pg_get_serial_sequence('public.dpr_reports', 'id'),
  (SELECT COALESCE(MAX(id), 1) FROM public.dpr_reports)
);

-- Verify (last_value should be >= max id):
-- SELECT last_value FROM pg_get_serial_sequence('public.dpr_reports', 'id')::regclass;
-- SELECT MAX(id) FROM public.dpr_reports;
