create or replace function public.manage_staff_profile(
  p_user_id uuid,
  p_display_name text,
  p_role text,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_role text;
  v_current_active boolean;
  v_current_approved_at timestamptz;
  v_admin_count integer;
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  if nullif(btrim(p_display_name), '') is null then
    raise exception 'Display name cannot be blank';
  end if;

  if p_role not in ('staff', 'admin') then
    raise exception 'Invalid staff role';
  end if;

  select role, active, approved_at
    into v_current_role, v_current_active, v_current_approved_at
  from public.staff_profiles
  where user_id = p_user_id;

  if not found then
    raise exception 'Staff profile not found';
  end if;

  if p_user_id = auth.uid() and (not p_active or p_role <> 'admin') then
    raise exception 'You cannot deactivate or demote your own administrator account';
  end if;

  if v_current_role = 'admin' and v_current_active and (not p_active or p_role <> 'admin') then
    select count(*) into v_admin_count
    from public.staff_profiles
    where active = true and role = 'admin';

    if v_admin_count <= 1 then
      raise exception 'Juanita Hub must keep at least one active administrator';
    end if;
  end if;

  update public.staff_profiles
  set display_name = btrim(p_display_name),
      role = p_role,
      active = p_active,
      approved_at = case
        when p_active and v_current_approved_at is null then now()
        else approved_at
      end,
      approved_by = case
        when p_active and v_current_approved_at is null then auth.uid()
        else approved_by
      end,
      updated_at = now()
  where user_id = p_user_id;
end;
$$;

revoke all on function public.manage_staff_profile(uuid, text, text, boolean) from public, anon;
grant execute on function public.manage_staff_profile(uuid, text, text, boolean) to authenticated;;