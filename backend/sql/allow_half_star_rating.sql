-- Verifier rating + feedback when a task is verified (half stars allowed: 0.5 .. 5).
-- Run once in Supabase → SQL Editor. Safe to re-run.
alter table tasks add column if not exists rating numeric(2,1);
alter table tasks drop constraint if exists tasks_rating_check;
alter table tasks alter column rating type numeric(2,1) using rating::numeric;
alter table tasks add constraint tasks_rating_check check (rating >= 0.5 and rating <= 5);
alter table tasks add column if not exists rating_answers jsonb;
alter table tasks add column if not exists rating_feedback text;
alter table tasks add column if not exists rated_by uuid references users(id);
alter table tasks add column if not exists rated_at timestamptz;
alter table tasks add column if not exists feedback_sent_whatsapp boolean default false;
create index if not exists tasks_rating_idx on tasks (assigned_to, rated_at) where rating is not null;
