-- Who an action was directed at (assignee, submitter, reviewer), for the per-user activity trail.
alter table audit_logs add column target_user_id uuid references users(id);
create index audit_logs_target_idx on audit_logs (target_user_id, at desc);
create index audit_logs_actor_at_idx on audit_logs (user_id, at desc);
