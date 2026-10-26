-- Meeting MoM storage (run after add_dip_bot.sql / add_chat_unread_meet.sql)

create table if not exists public.meeting_moms (
  id uuid primary key default gen_random_uuid(),
  chat_room_id uuid references public.chat_rooms(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  meeting_url text,
  title text not null,
  started_by uuid references public.users(id) on delete set null,
  started_at timestamptz default now(),
  mom_body text default '',
  attendees jsonb default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'final')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists meeting_moms_project_idx on public.meeting_moms(project_id);
create index if not exists meeting_moms_started_by_idx on public.meeting_moms(started_by);
create index if not exists meeting_moms_started_at_idx on public.meeting_moms(started_at desc);

notify pgrst, 'reload schema';
