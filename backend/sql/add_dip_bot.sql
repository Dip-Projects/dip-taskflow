-- DIP AI Bot + Team Chat + Project Management
-- Run once in Supabase SQL Editor

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

-- In-app chat rooms: dm | project (WhatsApp-group alternative)
create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('dm', 'project', 'bot')),
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

-- Bot Q&A history + alerts to admin
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

-- Overdue WhatsApp dedupe (one alert per task per day)
create table if not exists public.overdue_wa_log (
  task_id uuid not null references public.tasks(id) on delete cascade,
  alert_day date not null,
  sent_at timestamptz default now(),
  primary key (task_id, alert_day)
);

notify pgrst, 'reload schema';
