-- FMS step tracker needs to know when the verifier took a decision
-- (verified / sent for correction / sent for updation).

alter table public.tasks
  add column if not exists verification_decided_at timestamptz,
  add column if not exists first_verified_at timestamptz;

notify pgrst, 'reload schema';
