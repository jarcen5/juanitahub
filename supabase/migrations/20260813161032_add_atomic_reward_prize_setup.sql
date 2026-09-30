create or replace function public.add_reward_prize_with_inventory(
  p_name text,
  p_category_id bigint,
  p_tier_id bigint,
  p_month_start date,
  p_quantity integer,
  p_weight numeric
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prize_id bigint;
  v_name text := btrim(p_name);
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required.';
  end if;

  if v_name = '' then
    raise exception 'Prize name is required.';
  end if;
  if p_month_start <> date_trunc('month', p_month_start)::date then
    raise exception 'Reward month must be the first day of the month.';
  end if;
  if p_quantity < 0 then
    raise exception 'Stock cannot be negative.';
  end if;
  if p_weight <= 0 then
    raise exception 'Weight must be greater than zero.';
  end if;

  insert into public.wheel_prizes(category_id, name, required_tier_id, active)
  values (p_category_id, v_name, p_tier_id, true)
  returning id into v_prize_id;

  insert into public.wheel_inventory(
    prize_id, month_start, quantity_start, quantity_remaining, weight, enabled
  ) values (
    v_prize_id, p_month_start, p_quantity, p_quantity, p_weight, p_quantity > 0
  );

  return v_prize_id;
end;
$$;

revoke all on function public.add_reward_prize_with_inventory(text,bigint,bigint,date,integer,numeric) from public, anon;
grant execute on function public.add_reward_prize_with_inventory(text,bigint,bigint,date,integer,numeric) to authenticated;;