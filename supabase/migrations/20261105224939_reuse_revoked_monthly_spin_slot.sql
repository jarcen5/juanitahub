-- Fix uniqueness violation after revoking a monthly reward spin.
-- No prize history, stock, earned spin counts, or revocation log rows change.
-- The child FOR UPDATE lock already serializes monthly spins and revocations.
-- Current DB function preserved verbatim except for allocating a vacant spin number.

CREATE OR REPLACE FUNCTION public.spin_monthly_reward_wheel(p_child_id bigint, p_reward_month_start date, p_category_slug text)
 RETURNS TABLE(win_id bigint, prize_id bigint, prize_name text, category_name text, tier_name text, earned_spins integer, used_spins integer, remaining_spins integer, quantity_remaining integer, reward_month_start date, inventory_month_start date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  reward_month date:=date_trunc('month',p_reward_month_start)::date;
  e integer; u integer; v_next_spin integer; tid bigint; tname text; tmin integer; cid bigint; cname text;
  sid bigint; pid bigint; pname text; left_qty integer; wid bigint; target_weight numeric; total_weight numeric;
begin
  if not public.current_user_is_active_staff() then raise exception 'Not authorized'; end if;
  perform 1 from public.children c where c.id=p_child_id for update;
  if not found then raise exception 'Child not found'; end if;
  e:=public.reward_earned_spins(p_child_id,reward_month);
  select count(*)::integer into u from public.prize_wins w where w.child_id=p_child_id and w.month_start=reward_month;
  if e<=u then raise exception 'No spins remaining for this reward month'; end if;

  -- Revoked spins are deleted from prize_wins and recorded in
  -- reward_spin_revocations. A gap can remain (e.g. 1, 3), so count+1
  -- is NOT a safe spin_number. Reuse the first unoccupied entitlement
  -- number while keeping every existing win and revocation unchanged.
  select s.n into v_next_spin
  from generate_series(1, e) as s(n)
  where not exists (
    select 1
    from public.prize_wins w
    where w.child_id = p_child_id
      and w.month_start = reward_month
      and w.spin_number = s.n
  )
  order by s.n
  limit 1;
  if v_next_spin is null then
    raise exception 'No spins remaining for this reward month';
  end if;
  select t.id,t.name,t.min_spins into tid,tname,tmin from public.wheel_tiers t where t.active and t.min_spins<=e order by t.min_spins desc limit 1;
  select c.id,c.name into cid,cname from public.wheel_categories c where c.slug=p_category_slug and c.active;
  if tid is null or cid is null then raise exception 'Wheel unavailable'; end if;
  select sum(s.weight) into total_weight from public.wheel_stock s join public.wheel_prizes p on p.id=s.prize_id join public.wheel_tiers t on t.id=p.required_tier_id where p.active and p.category_id=cid and t.active and t.min_spins<=tmin and s.enabled and s.quantity_remaining>0;
  if coalesce(total_weight,0)<=0 then raise exception 'No in-stock prizes are available on this wheel'; end if;
  target_weight:=random()*total_weight;
  with q as (
    select s.id as stock_key,p.id as prize_key,p.name as prize_label,sum(s.weight) over(order by p.id) as running_weight
    from public.wheel_stock s join public.wheel_prizes p on p.id=s.prize_id join public.wheel_tiers t on t.id=p.required_tier_id
    where p.active and p.category_id=cid and t.active and t.min_spins<=tmin and s.enabled and s.quantity_remaining>0
  ) select q.stock_key,q.prize_key,q.prize_label into sid,pid,pname from q where q.running_weight>target_weight order by q.running_weight limit 1;
  update public.wheel_stock s set quantity_remaining=s.quantity_remaining-1,updated_at=now() where s.id=sid and s.quantity_remaining>0 returning s.quantity_remaining into left_qty;
  if not found then raise exception 'Prize stock changed; please spin again'; end if;
  insert into public.prize_wins(child_id,month_start,inventory_month_start,category_id,tier_id,prize_id,spin_number,earned_spins_snapshot,prize_name_snapshot,category_name_snapshot,tier_name_snapshot,recorded_by)
  values(p_child_id,reward_month,null,cid,tid,pid,v_next_spin,e,pname,cname,tname,auth.uid()) returning id into wid;
  return query select wid,pid,pname,cname,tname,e,u+1,greatest(0,e-u-1),left_qty,reward_month,null::date;
end;
$function$
;
