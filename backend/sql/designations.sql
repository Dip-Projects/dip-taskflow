-- Designation master (same shape as departments). Run once in Supabase SQL editor.
create table if not exists designations (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

-- Seed with the designations already used by employees
insert into designations (name)
select distinct trim(designation)
from users
where designation is not null and trim(designation) <> ''
on conflict (name) do nothing;
