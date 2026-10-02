create or replace function public.audit_child_registration_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.child_profile_audit(child_id, registration_id, area, action, changed_by)
    values (old.child_id, null, 'registration', 'delete', auth.uid());
    return old;
  elsif tg_op = 'INSERT' then
    insert into public.child_profile_audit(child_id, registration_id, area, action, changed_by)
    values (new.child_id, new.id, 'registration', 'insert', auth.uid());
    return new;
  else
    insert into public.child_profile_audit(child_id, registration_id, area, action, changed_by)
    values (new.child_id, new.id, 'registration', 'update', auth.uid());
    return new;
  end if;
end;
$$;;