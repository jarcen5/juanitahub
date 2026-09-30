
create or replace function public.activate_learning_lab_device_v2(
  p_label text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_device_id uuid := gen_random_uuid();
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  insert into public.learning_lab_devices(id,token_hash,label,created_by)
  values (
    v_device_id,
    'device-id:' || v_device_id::text,
    nullif(trim(coalesce(p_label,'')),''),
    auth.uid()
  );

  return v_device_id;
end;
$$;

grant insert on public.learning_lab_devices to authenticated;
grant select(id) on public.learning_lab_devices to authenticated;

grant select, insert, update, delete on public.learning_lab_devices to service_role;
grant select, insert, update, delete on public.learning_student_sessions to service_role;
grant select, insert, update, delete on public.learning_student_access to service_role;
grant select on public.children to service_role;
grant select on public.child_registrations to service_role;
grant select on public.learning_assignments to service_role;
grant select, update on public.learning_student_assignments to service_role;
grant select, insert, update on public.learning_typing_attempts to service_role;
grant select, insert, update on public.learning_quiz_attempts to service_role;
grant select, insert, update on public.learning_reading_attempts to service_role;
grant select, insert, update on public.learning_writing_submissions to service_role;
grant select, insert, update on public.learning_writing_revisions to service_role;
;