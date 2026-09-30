
create index if not exists staff_tasks_completed_by_idx
  on public.staff_tasks (completed_by);

drop policy if exists "admins can update staff tasks" on public.staff_tasks;
drop policy if exists "admins or assignees can update staff tasks" on public.staff_tasks;

create policy "admins or assignees can update staff tasks"
on public.staff_tasks
for update
to authenticated
using (
  (select public.current_user_is_admin())
  or (
    (select public.current_user_is_active_staff())
    and assigned_to = (select auth.uid())
  )
)
with check (
  (select public.current_user_is_admin())
  or (
    (select public.current_user_is_active_staff())
    and assigned_to = (select auth.uid())
  )
);

create or replace function public.enforce_staff_task_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.current_user_is_admin() then
    if new.status = 'completed' then
      if old.status is distinct from 'completed' or new.completed_at is null then
        new.completed_at := coalesce(new.completed_at, now());
      end if;
      new.completed_by := coalesce(new.completed_by, auth.uid());
    else
      new.completed_at := null;
      new.completed_by := null;
    end if;
    return new;
  end if;

  if not public.current_user_is_active_staff() or old.assigned_to is distinct from auth.uid() then
    raise exception 'You can update only tasks assigned to you';
  end if;

  if new.title is distinct from old.title
     or new.details is distinct from old.details
     or new.priority is distinct from old.priority
     or new.due_date is distinct from old.due_date
     or new.assigned_to is distinct from old.assigned_to
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Staff can change only their assigned task status';
  end if;

  if new.status not in ('todo','in_progress','completed') then
    raise exception 'Staff cannot set that task status';
  end if;

  if new.status = 'completed' then
    new.completed_at := now();
    new.completed_by := auth.uid();
  else
    new.completed_at := null;
    new.completed_by := null;
  end if;

  return new;
end;
$$;

drop trigger if exists staff_tasks_enforce_update on public.staff_tasks;
create trigger staff_tasks_enforce_update
before update on public.staff_tasks
for each row
execute function public.enforce_staff_task_update();

create or replace function public.update_my_task_status(
  p_task_id bigint,
  p_status text
)
returns public.staff_tasks
language plpgsql
security invoker
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

  update public.staff_tasks
  set status = p_status
  where id = p_task_id
    and assigned_to = auth.uid()
  returning * into v_task;

  if not found then
    raise exception 'Task not found or not assigned to you';
  end if;

  return v_task;
end;
$$;

revoke all on function public.update_my_task_status(bigint,text) from public;
revoke all on function public.update_my_task_status(bigint,text) from anon;
grant execute on function public.update_my_task_status(bigint,text) to authenticated;
;