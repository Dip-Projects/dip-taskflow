-- Allow Manage Employees / login role: hr (HRMS portal)
-- Run once in Supabase → SQL Editor.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'employee', 'head', 'client', 'hr'));
