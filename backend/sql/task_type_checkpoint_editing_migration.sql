-- Existing task types remain defaults and cannot have their checkpoint
-- templates changed. New task types are marked editable by the API.
alter table task_types
  add column if not exists is_default boolean not null default true;
