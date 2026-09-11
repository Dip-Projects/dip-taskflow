-- Optional photo when marking a recurring instance Done (with or without checkpoints)
ALTER TABLE recurring_task_instances
  ADD COLUMN IF NOT EXISTS photo_url text;
