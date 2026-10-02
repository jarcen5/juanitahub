
create table if not exists public.team_members (
  id bigint generated always as identity primary key,
  staff_user_id uuid unique references public.staff_profiles(user_id) on update cascade on delete set null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  member_type text not null default 'staff' check (member_type in ('staff','intern','volunteer')),
  title text,
  active boolean not null default true,
  supervisor_member_id bigint references public.team_members(id) on update cascade on delete set null,
  start_date date,
  end_date date,
  created_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  updated_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index if not exists team_members_active_type_idx
  on public.team_members(active, member_type);
create index if not exists team_members_supervisor_idx
  on public.team_members(supervisor_member_id);

insert into public.team_members (staff_user_id, display_name, member_type, active)
select sp.user_id, sp.display_name, 'staff', true
from public.staff_profiles sp
where sp.active = true
on conflict (staff_user_id) do update
set display_name = excluded.display_name,
    active = true,
    updated_at = now();

create table if not exists public.team_program_assignments (
  id bigint generated always as identity primary key,
  team_member_id bigint not null references public.team_members(id) on update cascade on delete cascade,
  program_id bigint not null references public.programs(id) on update cascade on delete cascade,
  assignment_role text,
  starts_on date,
  ends_on date,
  active boolean not null default true,
  created_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(team_member_id, program_id),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index if not exists team_program_assignments_program_idx
  on public.team_program_assignments(program_id, active);

create table if not exists public.team_schedule_blocks (
  id bigint generated always as identity primary key,
  team_member_id bigint not null references public.team_members(id) on update cascade on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  block_type text not null default 'shift' check (block_type in ('shift','available')),
  start_time time not null,
  end_time time not null,
  program_id bigint references public.programs(id) on update cascade on delete set null,
  location text,
  notes text,
  effective_start date,
  effective_end date,
  created_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  check (effective_end is null or effective_start is null or effective_end >= effective_start)
);

create index if not exists team_schedule_blocks_member_day_idx
  on public.team_schedule_blocks(team_member_id, day_of_week, start_time);
create index if not exists team_schedule_blocks_program_idx
  on public.team_schedule_blocks(program_id);

create table if not exists public.team_schedule_exceptions (
  id bigint generated always as identity primary key,
  team_member_id bigint not null references public.team_members(id) on update cascade on delete cascade,
  exception_date date not null,
  exception_type text not null check (exception_type in ('off','modified')),
  start_time time,
  end_time time,
  note text,
  created_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(team_member_id, exception_date),
  check (
    (exception_type = 'off' and start_time is null and end_time is null)
    or
    (exception_type = 'modified' and start_time is not null and end_time is not null and end_time > start_time)
  )
);

create index if not exists team_schedule_exceptions_date_idx
  on public.team_schedule_exceptions(exception_date, team_member_id);

alter table public.team_members enable row level security;
alter table public.team_program_assignments enable row level security;
alter table public.team_schedule_blocks enable row level security;
alter table public.team_schedule_exceptions enable row level security;

revoke all on table public.team_members from anon;
revoke all on table public.team_program_assignments from anon;
revoke all on table public.team_schedule_blocks from anon;
revoke all on table public.team_schedule_exceptions from anon;

grant select, insert, update, delete on table public.team_members to authenticated;
grant select, insert, update, delete on table public.team_program_assignments to authenticated;
grant select, insert, update, delete on table public.team_schedule_blocks to authenticated;
grant select, insert, update, delete on table public.team_schedule_exceptions to authenticated;

grant usage, select on sequence public.team_members_id_seq to authenticated;
grant usage, select on sequence public.team_program_assignments_id_seq to authenticated;
grant usage, select on sequence public.team_schedule_blocks_id_seq to authenticated;
grant usage, select on sequence public.team_schedule_exceptions_id_seq to authenticated;

drop policy if exists "active staff can view team members" on public.team_members;
create policy "active staff can view team members"
on public.team_members for select to authenticated
using ((select public.current_user_is_active_staff()));

drop policy if exists "admins can insert team members" on public.team_members;
create policy "admins can insert team members"
on public.team_members for insert to authenticated
with check ((select public.current_user_is_admin()));

drop policy if exists "admins can update team members" on public.team_members;
create policy "admins can update team members"
on public.team_members for update to authenticated
using ((select public.current_user_is_admin()))
with check ((select public.current_user_is_admin()));

drop policy if exists "admins can delete team members" on public.team_members;
create policy "admins can delete team members"
on public.team_members for delete to authenticated
using ((select public.current_user_is_admin()));

drop policy if exists "active staff can view team program assignments" on public.team_program_assignments;
create policy "active staff can view team program assignments"
on public.team_program_assignments for select to authenticated
using ((select public.current_user_is_active_staff()));

drop policy if exists "admins can insert team program assignments" on public.team_program_assignments;
create policy "admins can insert team program assignments"
on public.team_program_assignments for insert to authenticated
with check ((select public.current_user_is_admin()));

drop policy if exists "admins can update team program assignments" on public.team_program_assignments;
create policy "admins can update team program assignments"
on public.team_program_assignments for update to authenticated
using ((select public.current_user_is_admin()))
with check ((select public.current_user_is_admin()));

drop policy if exists "admins can delete team program assignments" on public.team_program_assignments;
create policy "admins can delete team program assignments"
on public.team_program_assignments for delete to authenticated
using ((select public.current_user_is_admin()));

drop policy if exists "active staff can view team schedules" on public.team_schedule_blocks;
create policy "active staff can view team schedules"
on public.team_schedule_blocks for select to authenticated
using ((select public.current_user_is_active_staff()));

drop policy if exists "admins can insert team schedules" on public.team_schedule_blocks;
create policy "admins can insert team schedules"
on public.team_schedule_blocks for insert to authenticated
with check ((select public.current_user_is_admin()));

drop policy if exists "admins can update team schedules" on public.team_schedule_blocks;
create policy "admins can update team schedules"
on public.team_schedule_blocks for update to authenticated
using ((select public.current_user_is_admin()))
with check ((select public.current_user_is_admin()));

drop policy if exists "admins can delete team schedules" on public.team_schedule_blocks;
create policy "admins can delete team schedules"
on public.team_schedule_blocks for delete to authenticated
using ((select public.current_user_is_admin()));

drop policy if exists "active staff can view team schedule exceptions" on public.team_schedule_exceptions;
create policy "active staff can view team schedule exceptions"
on public.team_schedule_exceptions for select to authenticated
using ((select public.current_user_is_active_staff()));

drop policy if exists "admins can insert team schedule exceptions" on public.team_schedule_exceptions;
create policy "admins can insert team schedule exceptions"
on public.team_schedule_exceptions for insert to authenticated
with check ((select public.current_user_is_admin()));

drop policy if exists "admins can update team schedule exceptions" on public.team_schedule_exceptions;
create policy "admins can update team schedule exceptions"
on public.team_schedule_exceptions for update to authenticated
using ((select public.current_user_is_admin()))
with check ((select public.current_user_is_admin()));

drop policy if exists "admins can delete team schedule exceptions" on public.team_schedule_exceptions;
create policy "admins can delete team schedule exceptions"
on public.team_schedule_exceptions for delete to authenticated
using ((select public.current_user_is_admin()));

create or replace function public.touch_team_record_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists team_members_touch_updated_at on public.team_members;
create trigger team_members_touch_updated_at
before update on public.team_members
for each row execute function public.touch_team_record_updated_at();

drop trigger if exists team_program_assignments_touch_updated_at on public.team_program_assignments;
create trigger team_program_assignments_touch_updated_at
before update on public.team_program_assignments
for each row execute function public.touch_team_record_updated_at();

drop trigger if exists team_schedule_blocks_touch_updated_at on public.team_schedule_blocks;
create trigger team_schedule_blocks_touch_updated_at
before update on public.team_schedule_blocks
for each row execute function public.touch_team_record_updated_at();

drop trigger if exists team_schedule_exceptions_touch_updated_at on public.team_schedule_exceptions;
create trigger team_schedule_exceptions_touch_updated_at
before update on public.team_schedule_exceptions
for each row execute function public.touch_team_record_updated_at();

create or replace function public.sync_active_staff_team_member()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.active then
    insert into public.team_members (staff_user_id, display_name, member_type, active, created_by, updated_by)
    values (new.user_id, new.display_name, 'staff', true, auth.uid(), auth.uid())
    on conflict (staff_user_id) do update
      set display_name = excluded.display_name,
          active = true,
          updated_by = auth.uid(),
          updated_at = now();
  else
    update public.team_members
    set active = false,
        updated_by = auth.uid(),
        updated_at = now()
    where staff_user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists staff_profiles_sync_team_member on public.staff_profiles;
create trigger staff_profiles_sync_team_member
after insert or update of display_name, active on public.staff_profiles
for each row execute function public.sync_active_staff_team_member();

alter table public.staff_tasks
  add column if not exists assigned_team_member_id bigint references public.team_members(id) on update cascade on delete set null;

update public.staff_tasks st
set assigned_team_member_id = tm.id
from public.team_members tm
where st.assigned_team_member_id is null
  and st.assigned_to = tm.staff_user_id;

alter table public.staff_tasks alter column assigned_to drop not null;

alter table public.staff_tasks
  drop constraint if exists staff_tasks_assignee_required;
alter table public.staff_tasks
  add constraint staff_tasks_assignee_required
  check (assigned_to is not null or assigned_team_member_id is not null);

create index if not exists staff_tasks_assigned_team_member_idx
  on public.staff_tasks(assigned_team_member_id, status, due_date);
;