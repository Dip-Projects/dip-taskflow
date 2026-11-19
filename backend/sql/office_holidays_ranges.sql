-- Office holidays as date RANGES (one row per holiday, from_date .. to_date).
-- Run once in Supabase SQL editor, BEFORE using the updated backend.

alter table public.office_holidays add column if not exists from_date date;
alter table public.office_holidays add column if not exists to_date date;

-- Existing one-day rows become one-day ranges.
update public.office_holidays
   set from_date = holiday_date,
       to_date = holiday_date
 where from_date is null;

alter table public.office_holidays alter column from_date set not null;
alter table public.office_holidays alter column to_date set not null;

alter table public.office_holidays
  drop constraint if exists office_holidays_to_after_from;
alter table public.office_holidays
  add constraint office_holidays_to_after_from check (to_date >= from_date);

-- Drops the old one-row-per-day column and its unique constraint.
alter table public.office_holidays drop column if exists holiday_date;
