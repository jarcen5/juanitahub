
create or replace function public.activate_learning_lab_device_v2(
  p_label text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_device_id uuid;
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  insert into public.learning_lab_devices(token_hash,label,created_by)
  values ('device-id:' || gen_random_uuid()::text, nullif(trim(coalesce(p_label,'')),''), auth.uid())
  returning id into v_device_id;

  update public.learning_lab_devices
  set token_hash = 'device-id:' || v_device_id::text
  where id = v_device_id;

  return v_device_id;
end;
$$;

revoke all on function public.activate_learning_lab_device_v2(text) from public, anon;
grant execute on function public.activate_learning_lab_device_v2(text) to authenticated;
;