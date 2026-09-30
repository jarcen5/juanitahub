create or replace function public.spin_reward_wheel(p_child_id bigint, p_month_start date, p_category_slug text)
returns table (win_id bigint, prize_id bigint, prize_name text, category_name text, tier_name text, earned_spins integer, used_spins integer, remaining_spins integer, quantity_remaining integer)
language plpgsql volatile security definer set search_path=public
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
  insert into public.prize_wins(child_id,month_start,category_id,tier_id,prize_id,spin_number,earned_spins_snapshot,prize_name_snapshot,category_name_snapshot,tier_name_snapshot,recorded_by)
  values(p_child_id,m,cid,tid,pid,u+1,e,pname,cname,tname,auth.uid()) returning id into wid;
  return query select wid,pid,pname,cname,tname,e,u+1,greatest(0,e-u-1),left_qty;
end;$$;
grant execute on function public.spin_reward_wheel(bigint,date,text) to authenticated;;