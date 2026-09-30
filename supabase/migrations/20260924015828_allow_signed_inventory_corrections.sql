
create or replace function public.adjust_inventory_stock(
  p_item_id bigint,
  p_location_id bigint,
  p_transaction_type text,
  p_quantity numeric,
  p_notes text default null,
  p_to_location_id bigint default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_current numeric(12,2);
  v_new numeric(12,2);
  v_dest_current numeric(12,2);
  v_dest_new numeric(12,2);
  v_change numeric(12,2);
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  if p_quantity is null or p_quantity = 0 then
    raise exception 'Quantity cannot be zero';
  end if;

  if p_transaction_type not in ('receive','use','transfer','damage_loss','correction') then
    raise exception 'Invalid inventory transaction type';
  end if;

  if p_transaction_type <> 'correction' and p_quantity < 0 then
    raise exception 'Quantity must be greater than zero for this adjustment type';
  end if;

  if not exists (select 1 from public.inventory_items where id=p_item_id and active) then
    raise exception 'Inventory item not found or inactive';
  end if;

  if not exists (select 1 from public.inventory_locations where id=p_location_id and active) then
    raise exception 'Inventory location not found or inactive';
  end if;

  insert into public.inventory_stock(item_id,location_id,quantity)
  values (p_item_id,p_location_id,0)
  on conflict (item_id,location_id) do nothing;

  select quantity into v_current
  from public.inventory_stock
  where item_id=p_item_id and location_id=p_location_id
  for update;

  if p_transaction_type = 'receive' then
    v_change := p_quantity;
  elsif p_transaction_type in ('use','damage_loss') then
    v_change := -p_quantity;
  elsif p_transaction_type = 'correction' then
    v_change := p_quantity;
  elsif p_transaction_type = 'transfer' then
    if p_to_location_id is null or p_to_location_id = p_location_id then
      raise exception 'Choose a different destination location';
    end if;
    if not exists (select 1 from public.inventory_locations where id=p_to_location_id and active) then
      raise exception 'Destination location not found or inactive';
    end if;
    v_change := -p_quantity;
  end if;

  v_new := v_current + v_change;
  if v_new < 0 then
    raise exception 'Not enough stock at this location';
  end if;

  update public.inventory_stock
  set quantity=v_new
  where item_id=p_item_id and location_id=p_location_id;

  insert into public.inventory_transactions(
    item_id,location_id,related_location_id,transaction_type,quantity_change,balance_after,notes,recorded_by
  )
  values (
    p_item_id,p_location_id,p_to_location_id,p_transaction_type,v_change,v_new,nullif(btrim(p_notes),''),auth.uid()
  );

  if p_transaction_type='transfer' then
    insert into public.inventory_stock(item_id,location_id,quantity)
    values (p_item_id,p_to_location_id,0)
    on conflict (item_id,location_id) do nothing;

    select quantity into v_dest_current
    from public.inventory_stock
    where item_id=p_item_id and location_id=p_to_location_id
    for update;

    v_dest_new := v_dest_current + p_quantity;

    update public.inventory_stock
    set quantity=v_dest_new
    where item_id=p_item_id and location_id=p_to_location_id;

    insert into public.inventory_transactions(
      item_id,location_id,related_location_id,transaction_type,quantity_change,balance_after,notes,recorded_by
    )
    values (
      p_item_id,p_to_location_id,p_location_id,'transfer',p_quantity,v_dest_new,nullif(btrim(p_notes),''),auth.uid()
    );
  end if;

  return jsonb_build_object(
    'item_id',p_item_id,
    'location_id',p_location_id,
    'balance_after',v_new,
    'destination_location_id',p_to_location_id,
    'destination_balance_after',case when p_transaction_type='transfer' then v_dest_new else null end
  );
end;
$$;

revoke all on function public.adjust_inventory_stock(bigint,bigint,text,numeric,text,bigint) from public;
revoke all on function public.adjust_inventory_stock(bigint,bigint,text,numeric,text,bigint) from anon;
grant execute on function public.adjust_inventory_stock(bigint,bigint,text,numeric,text,bigint) to authenticated;
;