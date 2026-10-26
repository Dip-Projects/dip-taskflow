-- WhatsApp-style unread + meeting message support
-- Run once in Supabase SQL Editor (after add_dip_bot.sql)

alter table public.chat_room_members
  add column if not exists last_read_at timestamptz default now();

alter table public.chat_messages
  add column if not exists msg_type text not null default 'text';

-- Optional: meeting_url for video-call system messages
alter table public.chat_messages
  add column if not exists meeting_url text;

notify pgrst, 'reload schema';
