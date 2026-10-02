create or replace function public.get_reward_roster(p_month_start date)
returns table (
  child_id bigint,
  child_name text,
  child_active boolean,
  earned_spins integer,
  used_spins integer,
  remaining_spins integer,
  tier_id bigint,
  tier_slug text,
  tier_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_active_staff() then
    raise exception 'Not authorized';
  end if;

  return query
  with totals as (
    select c.id child_id,
           trim(c.first_name || case when c.last_name is not null and c.last_name <> '' then ' ' || c.last_name else '' end) child_name,
           c.active child_active,
           public.reward_earned_spins(c.id, p_month_start) earned_spins,
           (select count(*)::integer from public.prize_wins w where w.child_id=c.id and w.month_start=date_trunc('month',p_month_start)::date) used_spins
    from public.children c
  )
  select t.child_id, t.child_name, t.child_active, t.earned_spins, t.used_spins,
         greatest(0, t.earned_spins - t.used_spins) remaining_spins,
         wt.id, wt.slug, wt.name
  from totals t
  left join lateral (
    select id, slug, name
    from public.wheel_tiers
    where active and min_spins <= t.earned_spins
    order by min_spins desc, display_order desc
    limit 1
  ) wt on true
  where t.earned_spins > 0 or t.used_spins > 0
  order by t.child_name;
end;
$$;

grant execute on function public.get_reward_roster(date) to authenticated;;