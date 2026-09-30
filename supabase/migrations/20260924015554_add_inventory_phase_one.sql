
create table if not exists public.inventory_categories (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  description text,
  active boolean not null default true,
  created_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  updated_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(name)
);

create table if not exists public.inventory_locations (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  parent_location_id bigint references public.inventory_locations(id) on update cascade on delete restrict,
  description text,
  active boolean not null default true,
  created_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  updated_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(parent_location_id, name)
);

create table if not exists public.inventory_items (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  category_id bigint references public.inventory_categories(id) on update cascade on delete set null,
  item_type text not null default 'consumable' check (item_type in ('consumable','durable')),
  unit text not null default 'each' check (char_length(btrim(unit)) between 1 and 40),
  minimum_stock numeric(12,2) not null default 0 check (minimum_stock >= 0),
  condition text not null default 'good' check (condition in ('new','good','fair','needs_repair','damaged','retired','not_applicable')),
  notes text,
  active boolean not null default true,
  created_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  updated_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_stock (
  item_id bigint not null references public.inventory_items(id) on update cascade on delete cascade,
  location_id bigint not null references public.inventory_locations(id) on update cascade on delete restrict,
  quantity numeric(12,2) not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key(item_id, location_id)
);

create table if not exists public.inventory_transactions (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.inventory_items(id) on update cascade on delete restrict,
  location_id bigint not null references public.inventory_locations(id) on update cascade on delete restrict,
  related_location_id bigint references public.inventory_locations(id) on update cascade on delete set null,
  transaction_type text not null check (transaction_type in ('receive','use','transfer','damage_loss','correction')),
  quantity_change numeric(12,2) not null check (quantity_change <> 0),
  balance_after numeric(12,2) not null check (balance_after >= 0),
  notes text,
  recorded_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  recorded_at timestamptz not null default now()
);

create index if not exists inventory_categories_active_name_idx on public.inventory_categories(active,name);
create index if not exists inventory_categories_created_by_idx on public.inventory_categories(created_by);
create index if not exists inventory_categories_updated_by_idx on public.inventory_categories(updated_by);
create index if not exists inventory_locations_parent_idx on public.inventory_locations(parent_location_id);
create index if not exists inventory_locations_active_name_idx on public.inventory_locations(active,name);
create index if not exists inventory_locations_created_by_idx on public.inventory_locations(created_by);
create index if not exists inventory_locations_updated_by_idx on public.inventory_locations(updated_by);
create index if not exists inventory_items_category_idx on public.inventory_items(category_id);
create index if not exists inventory_items_active_name_idx on public.inventory_items(active,name);
create index if not exists inventory_items_created_by_idx on public.inventory_items(created_by);
create index if not exists inventory_items_updated_by_idx on public.inventory_items(updated_by);
create index if not exists inventory_stock_location_idx on public.inventory_stock(location_id,item_id);
create index if not exists inventory_transactions_item_time_idx on public.inventory_transactions(item_id,recorded_at desc);
create index if not exists inventory_transactions_location_time_idx on public.inventory_transactions(location_id,recorded_at desc);
create index if not exists inventory_transactions_related_location_idx on public.inventory_transactions(related_location_id);
create index if not exists inventory_transactions_recorded_by_idx on public.inventory_transactions(recorded_by);

alter table public.inventory_categories enable row level security;
alter table public.inventory_locations enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_stock enable row level security;
alter table public.inventory_transactions enable row level security;

revoke all on table public.inventory_categories from anon;
revoke all on table public.inventory_locations from anon;
revoke all on table public.inventory_items from anon;
revoke all on table public.inventory_stock from anon;
revoke all on table public.inventory_transactions from anon;

grant select on table public.inventory_categories to authenticated;
grant select on table public.inventory_locations to authenticated;
grant select on table public.inventory_items to authenticated;
grant select on table public.inventory_stock to authenticated;
grant select on table public.inventory_transactions to authenticated;

grant insert, update, delete on table public.inventory_categories to authenticated;
grant insert, update, delete on table public.inventory_locations to authenticated;
grant insert, update, delete on table public.inventory_items to authenticated;
grant insert, update on table public.inventory_stock to authenticated;
grant insert on table public.inventory_transactions to authenticated;

grant usage, select on sequence public.inventory_categories_id_seq to authenticated;
grant usage, select on sequence public.inventory_locations_id_seq to authenticated;
grant usage, select on sequence public.inventory_items_id_seq to authenticated;
grant usage, select on sequence public.inventory_transactions_id_seq to authenticated;

create policy "active staff can view inventory categories"
on public.inventory_categories for select to authenticated
using ((select public.current_user_is_active_staff()));
create policy "admins can insert inventory categories"
on public.inventory_categories for insert to authenticated
with check ((select public.current_user_is_admin()));
create policy "admins can update inventory categories"
on public.inventory_categories for update to authenticated
using ((select public.current_user_is_admin()))
with check ((select public.current_user_is_admin()));
create policy "admins can delete inventory categories"
on public.inventory_categories for delete to authenticated
using ((select public.current_user_is_admin()));

create policy "active staff can view inventory locations"
on public.inventory_locations for select to authenticated
using ((select public.current_user_is_active_staff()));
create policy "admins can insert inventory locations"
on public.inventory_locations for insert to authenticated
with check ((select public.current_user_is_admin()));
create policy "admins can update inventory locations"
on public.inventory_locations for update to authenticated
using ((select public.current_user_is_admin()))
with check ((select public.current_user_is_admin()));
create policy "admins can delete inventory locations"
on public.inventory_locations for delete to authenticated
using ((select public.current_user_is_admin()));

create policy "active staff can view inventory items"
on public.inventory_items for select to authenticated
using ((select public.current_user_is_active_staff()));
create policy "admins can insert inventory items"
on public.inventory_items for insert to authenticated
with check ((select public.current_user_is_admin()));
create policy "admins can update inventory items"
on public.inventory_items for update to authenticated
using ((select public.current_user_is_admin()))
with check ((select public.current_user_is_admin()));
create policy "admins can delete inventory items"
on public.inventory_items for delete to authenticated
using ((select public.current_user_is_admin()));

create policy "active staff can view inventory stock"
on public.inventory_stock for select to authenticated
using ((select public.current_user_is_active_staff()));
create policy "admins can insert inventory stock"
on public.inventory_stock for insert to authenticated
with check ((select public.current_user_is_admin()));
create policy "admins can update inventory stock"
on public.inventory_stock for update to authenticated
using ((select public.current_user_is_admin()))
with check ((select public.current_user_is_admin()));

create policy "active staff can view inventory transactions"
on public.inventory_transactions for select to authenticated
using ((select public.current_user_is_active_staff()));
create policy "admins can insert inventory transactions"
on public.inventory_transactions for insert to authenticated
with check ((select public.current_user_is_admin()));

create or replace function public.touch_inventory_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger inventory_categories_touch
before update on public.inventory_categories
for each row execute function public.touch_inventory_updated_at();

create trigger inventory_locations_touch
before update on public.inventory_locations
for each row execute function public.touch_inventory_updated_at();

create trigger inventory_items_touch
before update on public.inventory_items
for each row execute function public.touch_inventory_updated_at();

create trigger inventory_stock_touch
before update on public.inventory_stock
for each row execute function public.touch_inventory_updated_at();

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

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  if p_transaction_type not in ('receive','use','transfer','damage_loss','correction') then
    raise exception 'Invalid inventory transaction type';
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

create or replace view public.inventory_low_stock_items
with (security_invoker = true)
as
select
  i.id as item_id,
  i.name,
  i.unit,
  i.minimum_stock,
  coalesce(sum(s.quantity),0)::numeric(12,2) as total_quantity,
  i.category_id
from public.inventory_items i
left join public.inventory_stock s on s.item_id=i.id
where i.active
group by i.id,i.name,i.unit,i.minimum_stock,i.category_id
having i.minimum_stock > 0
   and coalesce(sum(s.quantity),0) <= i.minimum_stock;

revoke all on public.inventory_low_stock_items from anon;
grant select on public.inventory_low_stock_items to authenticated;
;