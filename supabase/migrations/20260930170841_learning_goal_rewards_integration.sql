
create or replace function public.reward_earned_spins(p_child_id bigint, p_month_start date)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_points numeric := 0;
  v_goal_points numeric := 0;
  v_points_per_spin numeric := 0;
  v_diamond_bonus integer := 0;
begin
  if not public.current_user_is_active_staff() then
    raise exception 'Not authorized';
  end if;

  select coalesce(sum(points), 0),
         count(*) filter (where entry_type = 'behavior' and card = 'diamond')::integer
    into v_points, v_diamond_bonus
  from public.behavior_entries
  where child_id = p_child_id
    and entry_date >= date_trunc('month', p_month_start)::date
    and entry_date < (date_trunc('month', p_month_start) + interval '1 month')::date;

  select coalesce(sum(points),0)
    into v_goal_points
  from public.learning_goal_bonus_points
  where child_id=p_child_id
    and awarded_on >= date_trunc('month',p_month_start)::date
    and awarded_on < (date_trunc('month',p_month_start)+interval '1 month')::date;

  v_points := v_points + v_goal_points;

  select coalesce(points_per_spin, 0)
    into v_points_per_spin
  from public.app_settings
  where id = 1;

  if v_points_per_spin <= 0 then
    return greatest(0, v_diamond_bonus);
  end if;

  return greatest(0, round(v_points / v_points_per_spin)::integer) + v_diamond_bonus;
end;
$$;

revoke all on function public.reward_earned_spins(bigint,date) from public,anon;
grant execute on function public.reward_earned_spins(bigint,date) to authenticated,service_role;
;