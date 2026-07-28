-- Equipment master for Daily Report
-- Run in Supabase SQL Editor

-- Ensure columns exist (older DBs may only have name/meta)
create table if not exists public.dpr_equipment (
  id bigserial primary key,
  name text not null,
  source text,
  created_at timestamptz default now()
);
alter table public.dpr_equipment add column if not exists source text;
alter table public.dpr_equipment add column if not exists name text;

create table if not exists public.dpr_equipment_units (
  id bigserial primary key,
  name text unique not null
);

create table if not exists public.dpr_units (
  id bigserial primary key,
  name text unique not null
);

insert into public.dpr_equipment_units (name) values
  ('Nos'), ('Hrs'), ('Days'), ('Trips')
on conflict (name) do nothing;

insert into public.dpr_units (name) values
  ('Nos'), ('Kg'), ('Ton'), ('Cum'), ('Sqm'), ('Rmt'), ('Litre'), ('Bag'), ('Hrs')
on conflict (name) do nothing;

insert into public.dpr_equipment (name, source)
select v.name, v.source from (values
  ('Excavator', 'contractor'),
  ('JCB', 'contractor'),
  ('Tower Crane', 'contractor'),
  ('Mobile Crane', 'contractor'),
  ('Concrete Mixer', 'contractor'),
  ('Transit Mixer', 'contractor'),
  ('Vibrator', 'contractor'),
  ('Compactor', 'contractor'),
  ('Generator', 'contractor'),
  ('Welding Machine', 'contractor'),
  ('Bar Cutting Machine', 'contractor'),
  ('Bar Bending Machine', 'contractor'),
  ('Scaffolding', 'contractor'),
  ('Water Tanker', 'contractor'),
  ('Tractor', 'contractor'),
  ('Dumper', 'contractor'),
  ('Client Excavator', 'client'),
  ('Client Crane', 'client'),
  ('Client Generator', 'client'),
  ('Client Vehicle', 'client')
) as v(name, source)
where not exists (
  select 1 from public.dpr_equipment e
  where lower(coalesce(e.name,''))=lower(v.name)
    and lower(coalesce(e.source,''))=lower(v.source)
);

alter table public.dpr_equipment enable row level security;
drop policy if exists site_open_dpr_equipment on public.dpr_equipment;
create policy site_open_dpr_equipment on public.dpr_equipment for all using (true) with check (true);
grant select, insert, update, delete on public.dpr_equipment to anon, authenticated;

alter table public.dpr_equipment_units enable row level security;
drop policy if exists site_open_dpr_equipment_units on public.dpr_equipment_units;
create policy site_open_dpr_equipment_units on public.dpr_equipment_units for all using (true) with check (true);
grant select, insert, update, delete on public.dpr_equipment_units to anon, authenticated;

alter table public.dpr_units enable row level security;
drop policy if exists site_open_dpr_units on public.dpr_units;
create policy site_open_dpr_units on public.dpr_units for all using (true) with check (true);
grant select, insert, update, delete on public.dpr_units to anon, authenticated;

grant usage, select on all sequences in schema public to anon, authenticated;
notify pgrst, 'reload schema';
