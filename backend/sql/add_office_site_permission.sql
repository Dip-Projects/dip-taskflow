-- Office ↔ Site switch permission + ensure leave buddy columns exist
-- Run once in Supabase SQL Editor

alter table public.users
  add column if not exists can_switch_office_site boolean not null default false;

alter table public.users
  add column if not exists can_resolve_tickets boolean not null default false;

alter table public.users
  add column if not exists whatsapp_number text;

alter table public.leaves
  add column if not exists buddy_id uuid references public.users(id),
  add column if not exists buddy_status text default 'None',
  add column if not exists buddy_responded_at timestamptz,
  add column if not exists buddy_note text;

alter table public.tasks
  add column if not exists leave_cover_id uuid references public.leaves(id),
  add column if not exists leave_cover_from uuid references public.users(id);

do $$
begin
  alter table public.leaves drop constraint if exists leaves_buddy_status_check;
  alter table public.leaves
    add constraint leaves_buddy_status_check
    check (buddy_status in ('None', 'Pending', 'Accepted', 'Declined'));
exception when others then
  raise notice 'buddy_status check: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
