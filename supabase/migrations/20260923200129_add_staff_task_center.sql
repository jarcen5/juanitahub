
create table if not exists public.staff_tasks (
  id bigint generated always as identity primary key,
  title text not null check (char_length(btrim(title)) between 1 and 180),
  details text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'todo' check (status in ('todo','in_progress','completed','canceled')),
  due_date date,
  assigned_to uuid not null references public.staff_profiles(user_id) on update cascade on delete restrict,
  created_by uuid not null references public.staff_profiles(user_id) on update cascade on delete restrict,
  completed_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_tasks_assigned_status_due_idx
  on public.staff_tasks (assigned_to, status, due_date);

create index if not exists staff_tasks_created_by_idx
  on public.staff_tasks (created_by);

create index if not exists staff_tasks_status_due_idx
  on public.staff_tasks (status, due_date);

alter table public.staff_tasks enable row level security;

revoke all on table public.staff_tasks from anon;
grant select, insert, update, delete on table public.staff_tasks to authenticated;
grant usage, select on sequence public.staff_tasks_id_seq to authenticated;

drop policy if exists "active staff can view relevant tasks" on public.staff_tasks;
create policy "active staff can view relevant tasks"
on public.staff_tasks
for select
to authenticated
using (
  (select public.current_user_is_active_staff())
  and (
    (select public.current_user_is_admin())
    or assigned_to = (select auth.uid())
    or created_by = (select auth.uid())
  )
);

drop policy if exists "admins or staff self can create tasks" on public.staff_tasks;
create policy "admins or staff self can create tasks"
on public.staff_tasks
for insert
to authenticated
with check (
  (select public.current_user_is_admin())
  or (
    (select public.current_user_is_active_staff())
    and assigned_to = (select auth.uid())
    and created_by = (select auth.uid())
  )
);

drop policy if exists "admins can update staff tasks" on public.staff_tasks;
create policy "admins can update staff tasks"
on public.staff_tasks
for update
to authenticated
using ((select public.current_user_is_admin()))
with check ((select public.current_user_is_admin()));

drop policy if exists "admins can delete staff tasks" on public.staff_tasks;
create policy "admins can delete staff tasks"
on public.staff_tasks
for delete
to authenticated
using ((select public.current_user_is_admin()));

create or replace function public.touch_staff_task_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists staff_tasks_touch_updated_at on public.staff_tasks;
create trigger staff_tasks_touch_updated_at
before update on public.staff_tasks
for each row
execute function public.touch_staff_task_updated_at();

create or replace function public.update_my_task_status(
  p_task_id bigint,
  p_status text
)
returns public.staff_tasks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task public.staff_tasks;
begin
  if not public.current_user_is_active_staff() then
    raise exception 'Active staff access required';
  end if;

  if p_status not in ('todo','in_progress','completed') then
    raise exception 'Invalid task status';
  end if;

  select *
  into v_task
  from public.staff_tasks
  where id = p_task_id
    and assigned_to = auth.uid();

  if not found then
    raise exception 'Task not found or not assigned to you';
  end if;

  update public.staff_tasks
  set status = p_status,
      completed_at = case when p_status = 'completed' then now() else null end,
      completed_by = case when p_status = 'completed' then auth.uid() else null end
  where id = p_task_id
  returning * into v_task;

  return v_task;
end;
$$;

revoke all on function public.update_my_task_status(bigint,text) from public;
revoke all on function public.update_my_task_status(bigint,text) from anon;
grant execute on function public.update_my_task_status(bigint,text) to authenticated;
;