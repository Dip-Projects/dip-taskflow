-- Fix: Generate Evening/Morning DPR fails with
--   duplicate key value violates unique constraint "dpr_reports_pkey"
-- Cause: SERIAL sequence for dpr_reports.id lagged behind MAX(id).
-- Run once in Supabase → SQL Editor.

SELECT setval(
  pg_get_serial_sequence('public.dpr_reports', 'id'),
  COALESCE((SELECT MAX(id) FROM public.dpr_reports), 1)
);

-- Verify (next default id should be > max):
-- SELECT MAX(id) AS max_id,
--        pg_get_serial_sequence('public.dpr_reports', 'id') AS seq;
