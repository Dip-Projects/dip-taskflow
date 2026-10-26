-- Run ONCE in Supabase SQL Editor (safe to re-run).
-- Project transfer, team/project chat, DIP Bot, MoM, and FMS/start-verification timestamps.

-- Task step times (Start verification must survive refresh)
alter table public.tasks add column if not exists assigned_at timestamptz;
alter table public.tasks add column if not exists accepted_at timestamptz;
alter table public.tasks add column if not exists sent_for_verification_at timestamptz;
alter table public.tasks add column if not exists verification_started_at timestamptz;
alter table public.tasks add column if not exists verification_started_by uuid;
alter table public.tasks add column if not exists verified_at timestamptz;
alter table public.tasks add column if not exists rejected_at timestamptz;
alter table public.tasks add column if not exists verification_decided_at timestamptz;
alter table public.tasks add column if not exists first_sent_for_verification_at timestamptz;
alter table public.tasks add column if not exists first_verification_started_at timestamptz;
alter table public.tasks add column if not exists first_verified_at timestamptz;
alter table public.tasks add column if not exists task_events jsonb default '[]'::jsonb;

-- Who works on which project (shift people between projects)
create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role_on_project text default 'member',
  assigned_at timestamptz default now(),
  assigned_by uuid references public.users(id),
  unique (project_id, user_id)
);

create index if not exists project_members_user_idx on public.project_members(user_id);
create index if not exists project_members_project_idx on public.project_members(project_id);

create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('dm', 'project', 'bot', 'team')),
  title text,
  project_id uuid references public.projects(id) on delete cascade,
  invite_code text unique,
  created_by uuid references public.users(id),
  created_at timestamptz default now()
);

create table if not exists public.chat_room_members (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  joined_at timestamptz default now(),
  last_read_at timestamptz default now(),
  primary key (room_id, user_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  sender_id uuid references public.users(id) on delete set null,
  body text not null,
  is_bot boolean default false,
  msg_type text not null default 'text',
  meeting_url text,
  created_at timestamptz default now()
);

create index if not exists chat_messages_room_idx on public.chat_messages(room_id, created_at);

alter table public.chat_rooms drop constraint if exists chat_rooms_kind_check;
alter table public.chat_rooms add constraint chat_rooms_kind_check
  check (kind in ('dm', 'project', 'bot', 'team'));

alter table public.chat_room_members
  add column if not exists last_read_at timestamptz default now();
alter table public.chat_messages
  add column if not exists msg_type text not null default 'text';
alter table public.chat_messages
  add column if not exists meeting_url text;

create table if not exists public.bot_qa (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  question text not null,
  answer text not null,
  is_admin_only_data boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.bot_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  body text not null,
  link_hint text,
  is_read boolean default false,
  created_at timestamptz default now()
);

create index if not exists bot_alerts_user_idx on public.bot_alerts(user_id, is_read);

create table if not exists public.overdue_wa_log (
  task_id uuid not null references public.tasks(id) on delete cascade,
  alert_day date not null,
  sent_at timestamptz default now(),
  primary key (task_id, alert_day)
);

create table if not exists public.meeting_moms (
  id uuid primary key default gen_random_uuid(),
  chat_room_id uuid references public.chat_rooms(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  meeting_url text,
  title text not null,
  started_by uuid references public.users(id) on delete set null,
  started_at timestamptz default now(),
  mom_body text default '',
  live_transcript text default '',
  attendees jsonb default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'final')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.meeting_moms
  add column if not exists live_transcript text default '';

create index if not exists meeting_moms_project_idx on public.meeting_moms(project_id);
create index if not exists meeting_moms_started_by_idx on public.meeting_moms(started_by);
create index if not exists meeting_moms_started_at_idx on public.meeting_moms(started_at desc);

-- Backend uses the service role; keep policies open for these tables.
alter table public.project_members enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.chat_room_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.bot_qa enable row level security;
alter table public.bot_alerts enable row level security;
alter table public.overdue_wa_log enable row level security;
alter table public.meeting_moms enable row level security;

drop policy if exists "backend full access" on public.project_members;
create policy "backend full access" on public.project_members for all using (true) with check (true);
drop policy if exists "backend full access" on public.chat_rooms;
create policy "backend full access" on public.chat_rooms for all using (true) with check (true);
drop policy if exists "backend full access" on public.chat_room_members;
create policy "backend full access" on public.chat_room_members for all using (true) with check (true);
drop policy if exists "backend full access" on public.chat_messages;
create policy "backend full access" on public.chat_messages for all using (true) with check (true);
drop policy if exists "backend full access" on public.bot_qa;
create policy "backend full access" on public.bot_qa for all using (true) with check (true);
drop policy if exists "backend full access" on public.bot_alerts;
create policy "backend full access" on public.bot_alerts for all using (true) with check (true);
drop policy if exists "backend full access" on public.overdue_wa_log;
create policy "backend full access" on public.overdue_wa_log for all using (true) with check (true);
drop policy if exists "backend full access" on public.meeting_moms;
create policy "backend full access" on public.meeting_moms for all using (true) with check (true);

notify pgrst, 'reload schema';
