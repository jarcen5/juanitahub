
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
     or new.assigned_team_member_id is distinct from old.assigned_team_member_id
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
;