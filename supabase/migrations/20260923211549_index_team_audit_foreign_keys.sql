
create index if not exists team_members_created_by_idx on public.team_members(created_by);
create index if not exists team_members_updated_by_idx on public.team_members(updated_by);
create index if not exists team_program_assignments_created_by_idx on public.team_program_assignments(created_by);
create index if not exists team_schedule_blocks_created_by_idx on public.team_schedule_blocks(created_by);
create index if not exists team_schedule_exceptions_created_by_idx on public.team_schedule_exceptions(created_by);
;