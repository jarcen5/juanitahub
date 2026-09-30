
create or replace function public.activate_learning_lab_device(
  p_token_hash text,
  p_label text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  insert into public.learning_lab_devices(token_hash,label,created_by)
  values (p_token_hash, nullif(trim(coalesce(p_label,'')),''), auth.uid());

  return true;
end;
$$;

revoke all on function public.activate_learning_lab_device(text,text) from public, anon;
grant execute on function public.activate_learning_lab_device(text,text) to authenticated;
;