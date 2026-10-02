create or replace function public.set_operating_day(
  p_service_date date,
  p_is_open boolean,
  p_reason text default null
)
returns public.operating_days
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.operating_days%rowtype;
begin
  if not public.current_user_is_active_staff() then
    raise exception 'Active staff access required';
  end if;

  if p_service_date is null then
    raise exception 'Service date is required';
  end if;

  if not p_is_open and exists (
    select 1
    from public.attendance_visits av
    where av.service_date = p_service_date
      and av.status = 'active'
  ) then
    raise exception 'This date has active sign-ins. Correct or void those records before marking the center closed.';
  end if;

  insert into public.operating_days (service_date, is_open, reason, recorded_by)
  values (p_service_date, p_is_open, nullif(btrim(p_reason), ''), auth.uid())
  on conflict (service_date) do update
    set is_open = excluded.is_open,
        reason = excluded.reason,
        recorded_by = auth.uid(),
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.set_operating_day(date, boolean, text) from public, anon;
grant execute on function public.set_operating_day(date, boolean, text) to authenticated;;