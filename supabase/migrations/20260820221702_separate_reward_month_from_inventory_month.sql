alter table public.prize_wins
  add column if not exists inventory_month_start date;

update public.prize_wins
set inventory_month_start = month_start
where inventory_month_start is null;

alter table public.prize_wins
  alter column inventory_month_start set not null;

alter table public.prize_wins
  drop constraint if exists prize_wins_inventory_month_start_check;

alter table public.prize_wins
  add constraint prize_wins_inventory_month_start_check
  check (inventory_month_start = date_trunc('month', inventory_month_start)::date);

create index if not exists prize_wins_inventory_month_idx
  on public.prize_wins(inventory_month_start);

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
set search_path = public
as $$
declare
  m date:=date_trunc('month',p_month_start)::date; e integer; u integer;
  tid bigint; tname text; tmin integer; cid bigint; cname text;
  iid bigint; pid bigint; pname text; left_qty integer; wid bigint; target_weight numeric; total_weight numeric;
begin
  if not public.current_user_is_active_staff() then raise exception 'Not authorized'; end if;
  perform 1 from public.children c where c.id=p_child_id for update;
  e:=public.reward_earned_spins(p_child_id,m);
  select count(*)::integer into u from public.prize_wins w where w.child_id=p_child_id and w.month_start=m;
  if e<=u then raise exception 'No spins remaining'; end if;
  select t.id,t.name,t.min_spins into tid,tname,tmin from public.wheel_tiers t where t.active and t.min_spins<=e order by t.min_spins desc limit 1;
  select c.id,c.name into cid,cname from public.wheel_categories c where c.slug=p_category_slug and c.active;
  if tid is null or cid is null then raise exception 'Wheel unavailable'; end if;
  select sum(i.weight) into total_weight from public.wheel_inventory i join public.wheel_prizes p on p.id=i.prize_id join public.wheel_tiers t on t.id=p.required_tier_id where p.active and p.category_id=cid and t.active and t.min_spins<=tmin and i.month_start=m and i.enabled and i.quantity_remaining>0;
  if coalesce(total_weight,0)<=0 then raise exception 'No in-stock prizes are available on this wheel'; end if;
  target_weight:=random()*total_weight;
  with q as (
    select i.id as inventory_key,p.id as prize_key,p.name as prize_label,sum(i.weight) over(order by p.id) as running_weight
    from public.wheel_inventory i join public.wheel_prizes p on p.id=i.prize_id join public.wheel_tiers t on t.id=p.required_tier_id
    where p.active and p.category_id=cid and t.active and t.min_spins<=tmin and i.month_start=m and i.enabled and i.quantity_remaining>0
  ) select q.inventory_key,q.prize_key,q.prize_label into iid,pid,pname from q where q.running_weight>target_weight order by q.running_weight limit 1;
  update public.wheel_inventory i set quantity_remaining=i.quantity_remaining-1,updated_at=now() where i.id=iid and i.quantity_remaining>0 returning i.quantity_remaining into left_qty;
  if not found then raise exception 'Prize stock changed; please spin again'; end if;
  insert into public.prize_wins(child_id,month_start,inventory_month_start,category_id,tier_id,prize_id,spin_number,earned_spins_snapshot,prize_name_snapshot,category_name_snapshot,tier_name_snapshot,recorded_by)
  values(p_child_id,m,m,cid,tid,pid,u+1,e,pname,cname,tname,auth.uid()) returning id into wid;
  return query select wid,pid,pname,cname,tname,e,u+1,greatest(0,e-u-1),left_qty;
end;
$$;

create or replace function public.get_available_monthly_wheel(
  p_child_id bigint,
  p_reward_month_start date,
  p_inventory_month_start date,
  p_category_slug text
)
returns table(
  prize_id bigint,
  prize_name text,
  weight numeric,
  quantity_remaining integer,
  required_tier_slug text,
  required_tier_name text,
  unlocked_tier_slug text,
  unlocked_tier_name text,
  earned_spins integer,
  used_spins integer,
  remaining_spins integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  reward_month date := date_trunc('month', p_reward_month_start)::date;
  inventory_month date := date_trunc('month', p_inventory_month_start)::date;
  v_earned integer;
  v_used integer;
  v_unlocked_min integer;
  v_unlocked_slug text;
  v_unlocked_name text;
begin
  if not public.current_user_is_active_staff() then raise exception 'Not authorized'; end if;

  v_earned := public.reward_earned_spins(p_child_id, reward_month);
  select count(*)::integer into v_used
  from public.prize_wins
  where child_id = p_child_id and month_start = reward_month;

  select min_spins, slug, name
    into v_unlocked_min, v_unlocked_slug, v_unlocked_name
  from public.wheel_tiers
  where active and min_spins <= v_earned
  order by min_spins desc
  limit 1;

  if coalesce(v_earned-v_used,0) <= 0 or v_unlocked_min is null then return; end if;

  return query
  select p.id, p.name, i.weight, i.quantity_remaining, rt.slug, rt.name,
         v_unlocked_slug, v_unlocked_name, v_earned, v_used, greatest(0,v_earned-v_used)
  from public.wheel_prizes p
  join public.wheel_categories c on c.id=p.category_id and c.slug=p_category_slug and c.active
  join public.wheel_tiers rt on rt.id=p.required_tier_id and rt.active and rt.min_spins <= v_unlocked_min
  join public.wheel_inventory i on i.prize_id=p.id and i.month_start=inventory_month
  where p.active and i.enabled and i.quantity_remaining > 0 and i.weight > 0
  order by rt.min_spins, p.name;
end;
$$;

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
set search_path = public
as $$
declare
  reward_month date := date_trunc('month', p_reward_month_start)::date;
  inventory_month date := date_trunc('month', p_inventory_month_start)::date;
  e integer; u integer;
  tid bigint; tname text; tmin integer; cid bigint; cname text;
  iid bigint; pid bigint; pname text; left_qty integer; wid bigint;
  target_weight numeric; total_weight numeric;
begin
  if not public.current_user_is_active_staff() then raise exception 'Not authorized'; end if;

  perform 1 from public.children c where c.id=p_child_id for update;
  if not found then raise exception 'Child not found'; end if;

  e := public.reward_earned_spins(p_child_id, reward_month);
  select count(*)::integer into u
  from public.prize_wins w
  where w.child_id=p_child_id and w.month_start=reward_month;

  if e <= u then raise exception 'No spins remaining for this reward month'; end if;

  select t.id,t.name,t.min_spins into tid,tname,tmin
  from public.wheel_tiers t
  where t.active and t.min_spins<=e
  order by t.min_spins desc
  limit 1;

  select c.id,c.name into cid,cname
  from public.wheel_categories c
  where c.slug=p_category_slug and c.active;

  if tid is null or cid is null then raise exception 'Wheel unavailable'; end if;

  select sum(i.weight) into total_weight
  from public.wheel_inventory i
  join public.wheel_prizes p on p.id=i.prize_id
  join public.wheel_tiers t on t.id=p.required_tier_id
  where p.active
    and p.category_id=cid
    and t.active
    and t.min_spins<=tmin
    and i.month_start=inventory_month
    and i.enabled
    and i.quantity_remaining>0;

  if coalesce(total_weight,0)<=0 then
    raise exception 'No in-stock prizes are available in the selected inventory month';
  end if;

  target_weight := random()*total_weight;

  with q as (
    select i.id as inventory_key,
           p.id as prize_key,
           p.name as prize_label,
           sum(i.weight) over(order by p.id) as running_weight
    from public.wheel_inventory i
    join public.wheel_prizes p on p.id=i.prize_id
    join public.wheel_tiers t on t.id=p.required_tier_id
    where p.active
      and p.category_id=cid
      and t.active
      and t.min_spins<=tmin
      and i.month_start=inventory_month
      and i.enabled
      and i.quantity_remaining>0
  )
  select q.inventory_key,q.prize_key,q.prize_label
    into iid,pid,pname
  from q
  where q.running_weight>target_weight
  order by q.running_weight
  limit 1;

  update public.wheel_inventory i
  set quantity_remaining=i.quantity_remaining-1, updated_at=now()
  where i.id=iid and i.quantity_remaining>0
  returning i.quantity_remaining into left_qty;

  if not found then raise exception 'Prize stock changed; please spin again'; end if;

  insert into public.prize_wins(
    child_id,month_start,inventory_month_start,category_id,tier_id,prize_id,
    spin_number,earned_spins_snapshot,prize_name_snapshot,
    category_name_snapshot,tier_name_snapshot,recorded_by
  )
  values(
    p_child_id,reward_month,inventory_month,cid,tid,pid,
    u+1,e,pname,cname,tname,auth.uid()
  )
  returning id into wid;

  return query
  select wid,pid,pname,cname,tname,e,u+1,greatest(0,e-u-1),left_qty,reward_month,inventory_month;
end;
$$;

revoke all on function public.get_available_monthly_wheel(bigint,date,date,text) from public, anon;
grant execute on function public.get_available_monthly_wheel(bigint,date,date,text) to authenticated;
revoke all on function public.spin_monthly_reward_wheel(bigint,date,date,text) from public, anon;
grant execute on function public.spin_monthly_reward_wheel(bigint,date,date,text) to authenticated;;