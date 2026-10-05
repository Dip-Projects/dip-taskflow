-- PC (Process Controller) on Manage sites.
-- Supabase → SQL Editor → Run. Safe to re-run.

alter table public.projects
  add column if not exists pc_id uuid references public.users(id);

notify pgrst, 'reload schema';
