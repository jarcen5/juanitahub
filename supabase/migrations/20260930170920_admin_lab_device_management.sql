
create or replace function public.admin_list_learning_lab_devices()
returns table(
  id uuid,
  label text,
  enabled boolean,
  created_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by_name text,
  active_sessions bigint
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  return query
  select
    d.id,
    d.label,
    d.enabled,
    d.created_at,
    d.last_used_at,
    d.revoked_at,
    coalesce(sp.display_name,'Unknown admin') as created_by_name,
    (
      select count(*)
      from public.learning_student_sessions s
      where s.device_id=d.id
        and s.expires_at > now()
    )::bigint as active_sessions
  from public.learning_lab_devices d
  left join public.staff_profiles sp on sp.user_id=d.created_by
  order by
    case when d.enabled and d.revoked_at is null then 0 else 1 end,
    coalesce(d.last_used_at,d.created_at) desc;
end;
$$;

create or replace function public.admin_rename_learning_lab_device(
  p_device_id uuid,
  p_label text
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_updated integer;
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.learning_lab_devices
  set label=nullif(trim(coalesce(p_label,'')),'')
  where id=p_device_id;

  get diagnostics v_updated = row_count;
  return v_updated=1;
end;
$$;

create or replace function public.admin_revoke_learning_lab_device(
  p_device_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_updated integer;
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.learning_lab_devices
  set enabled=false,
      revoked_at=coalesce(revoked_at,now())
  where id=p_device_id
    and enabled=true
    and revoked_at is null;

  get diagnostics v_updated = row_count;

  if v_updated=1 then
    delete from public.learning_student_sessions where device_id=p_device_id;
  end if;

  return v_updated=1;
end;
$$;

revoke all on function public.admin_list_learning_lab_devices() from public,anon;
grant execute on function public.admin_list_learning_lab_devices() to authenticated;

revoke all on function public.admin_rename_learning_lab_device(uuid,text) from public,anon;
grant execute on function public.admin_rename_learning_lab_device(uuid,text) to authenticated;

revoke all on function public.admin_revoke_learning_lab_device(uuid) from public,anon;
grant execute on function public.admin_revoke_learning_lab_device(uuid) to authenticated;
;