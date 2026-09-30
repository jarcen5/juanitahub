
-- API roles never need DDL-like table privileges.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- Keep Learning Goal bonuses bound to the same child as the approved goal.
drop policy if exists "active staff can award learning goal bonuses" on public.learning_goal_bonus_points;
create policy "active staff can award learning goal bonuses"
on public.learning_goal_bonus_points
for insert
to authenticated
with check (
  public.current_user_is_active_staff()
  and awarded_by = (select auth.uid())
  and points = 1
  and exists (
    select 1
    from public.learning_goals g
    where g.id = goal_id
      and g.child_id = learning_goal_bonus_points.child_id
      and g.status = 'approved'
      and g.reward_points = learning_goal_bonus_points.points
  )
);

-- Internal Reward RPCs are staff-only.
revoke all on function public.get_available_wheel(bigint,date,text) from public, anon;
grant execute on function public.get_available_wheel(bigint,date,text) to authenticated, service_role;

revoke all on function public.get_reward_roster(date) from public, anon;
grant execute on function public.get_reward_roster(date) to authenticated, service_role;

revoke all on function public.reward_earned_spins(bigint,date) from public, anon;
grant execute on function public.reward_earned_spins(bigint,date) to authenticated, service_role;

revoke all on function public.spin_monthly_reward_wheel(bigint,date,text) from public, anon;
grant execute on function public.spin_monthly_reward_wheel(bigint,date,text) to authenticated, service_role;

-- Legacy wrapper: make the Staff guard explicit at this entry point too.
create or replace function public.spin_monthly_reward_wheel(
  p_child_id bigint,
  p_reward_month_start date,
  p_inventory_month_start date,
  p_category_slug text
)
returns table(
  win_id bigint,
  prize_id bigint,
  prize_name text,
  category_name text,
  tier_name text,
  earned_spins integer,
  used_spins integer,
  remaining_spins integer,
  quantity_remaining integer,
  reward_month_start date,
  inventory_month_start date
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.current_user_is_active_staff() then
    raise exception 'Not authorized';
  end if;

  return query
  select *
  from public.spin_monthly_reward_wheel(
    p_child_id,
    p_reward_month_start,
    p_category_slug
  );
end;
$$;

revoke all on function public.spin_monthly_reward_wheel(bigint,date,date,text) from public,anon;
grant execute on function public.spin_monthly_reward_wheel(bigint,date,date,text) to authenticated;

create or replace function public.spin_reward_wheel(
  p_child_id bigint,
  p_month_start date,
  p_category_slug text
)
returns table(
  win_id bigint,
  prize_id bigint,
  prize_name text,
  category_name text,
  tier_name text,
  earned_spins integer,
  used_spins integer,
  remaining_spins integer,
  quantity_remaining integer
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.current_user_is_active_staff() then
    raise exception 'Not authorized';
  end if;

  return query
  select
    r.win_id,
    r.prize_id,
    r.prize_name,
    r.category_name,
    r.tier_name,
    r.earned_spins,
    r.used_spins,
    r.remaining_spins,
    r.quantity_remaining
  from public.spin_monthly_reward_wheel(
    p_child_id,
    p_month_start,
    p_category_slug
  ) r;
end;
$$;

revoke all on function public.spin_reward_wheel(bigint,date,text) from public,anon;
grant execute on function public.spin_reward_wheel(bigint,date,text) to authenticated,service_role;

-- Event-trigger helper is not an API function.
revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role;
;