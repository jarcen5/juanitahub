create or replace function public.audit_child_guardian_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_registration_id bigint;
  v_child_id bigint;
begin
  v_registration_id := case when tg_op = 'DELETE' then old.registration_id else new.registration_id end;
  select child_id into v_child_id from public.child_registrations where id = v_registration_id;
  if v_child_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  insert into public.child_profile_audit(child_id, registration_id, area, action, changed_by)
  values (v_child_id, v_registration_id, 'guardian', lower(tg_op), auth.uid());
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.audit_child_health_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_registration_id bigint;
  v_child_id bigint;
begin
  v_registration_id := case when tg_op = 'DELETE' then old.registration_id else new.registration_id end;
  select child_id into v_child_id from public.child_registrations where id = v_registration_id;
  if v_child_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  insert into public.child_profile_audit(child_id, registration_id, area, action, changed_by)
  values (v_child_id, v_registration_id, 'health', lower(tg_op), auth.uid());
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;;