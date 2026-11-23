-- Verifier rating + feedback when a task is verified.
-- Run once in Supabase → SQL Editor.
alter table tasks add column if not exists rating smallint check (rating between 1 and 5);
alter table tasks add column if not exists rating_answers jsonb;
alter table tasks add column if not exists rating_feedback text;
alter table tasks add column if not exists rated_by uuid references users(id);
alter table tasks add column if not exists rated_at timestamptz;
alter table tasks add column if not exists feedback_sent_whatsapp boolean default false;
create index if not exists tasks_rating_idx on tasks (assigned_to, rated_at) where rating is not null;
