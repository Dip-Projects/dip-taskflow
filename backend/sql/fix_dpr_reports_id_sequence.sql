-- Permanent fix for: duplicate key value violates unique constraint "dpr_reports_pkey"
-- Live column is int4/serial (keep it — app inserts random ids for new rows).
-- Run once in Supabase → SQL Editor.

-- 1) Resync sequence so any DEFAULT id inserts also work
SELECT setval(
  pg_get_serial_sequence('public.dpr_reports', 'id'),
  (SELECT COALESCE(MAX(id), 1) FROM public.dpr_reports)
);

-- 2) Drop duplicate rows for the same site/engineer/type/date (keep highest id)
DELETE FROM public.dpr_reports a
USING public.dpr_reports b
WHERE a.ctid < b.ctid
  AND a.site IS NOT DISTINCT FROM b.site
  AND a.engineer IS NOT DISTINCT FROM b.engineer
  AND a.report_type IS NOT DISTINCT FROM b.report_type
  AND a.date IS NOT DISTINCT FROM b.date;

-- 3) Unique business key so regenerating the same DPR cannot create a 2nd row
CREATE UNIQUE INDEX IF NOT EXISTS dpr_reports_site_eng_type_date_uidx
  ON public.dpr_reports (site, engineer, report_type, date);
