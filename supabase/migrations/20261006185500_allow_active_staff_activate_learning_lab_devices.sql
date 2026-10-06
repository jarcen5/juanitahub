create or replace function public.activate_learning_lab_device(p_token_hash text, p_label text)
returns boolean
language plpgsql
set search_path to 'public'
as $function$
begin
  if not public.current_user_is_active_staff() then
    raise exception 'Active staff access required';
  end if;

  insert into public.learning_lab_devices(token_hash,label,created_by)
  values (p_token_hash, nullif(trim(coalesce(p_label,'')),''), auth.uid());

  return true;
end;
$function$;

drop policy if exists "admins can activate learning lab devices"
on public.learning_lab_devices;

create policy "active staff can activate learning lab devices"
on public.learning_lab_devices
for insert
to authenticated
with check (
  (select public.current_user_is_active_staff())
  and created_by = (select auth.uid())
);
