
create table if not exists public.budget_accounts (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  period_label text,
  starts_on date,
  ends_on date,
  program_id bigint references public.programs(id) on update cascade on delete set null,
  allocated_amount numeric(12,2) not null default 0 check (allocated_amount >= 0),
  notes text,
  active boolean not null default true,
  created_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  updated_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table if not exists public.purchase_requests (
  id bigint generated always as identity primary key,
  budget_id bigint not null references public.budget_accounts(id) on update cascade on delete restrict,
  program_id bigint references public.programs(id) on update cascade on delete set null,
  vendor text,
  status text not null default 'planned'
    check (status in ('planned','awaiting_approval','approved','ordered','received','canceled')),
  order_reference text,
  notes text,
  requested_by uuid not null references public.staff_profiles(user_id) on update cascade on delete restrict,
  submitted_at timestamptz,
  approved_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  approved_at timestamptz,
  ordered_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  ordered_at timestamptz,
  received_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  received_at timestamptz,
  canceled_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  canceled_at timestamptz,
  updated_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_request_items (
  id bigint generated always as identity primary key,
  purchase_request_id bigint not null references public.purchase_requests(id) on update cascade on delete cascade,
  description text not null check (char_length(btrim(description)) between 1 and 200),
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit text not null default 'each' check (char_length(btrim(unit)) between 1 and 40),
  estimated_unit_cost numeric(12,2) not null default 0 check (estimated_unit_cost >= 0),
  actual_unit_cost numeric(12,2) check (actual_unit_cost is null or actual_unit_cost >= 0),
  inventory_category_id bigint references public.inventory_categories(id) on update cascade on delete set null,
  inventory_item_id bigint references public.inventory_items(id) on update cascade on delete set null,
  inventory_location_id bigint references public.inventory_locations(id) on update cascade on delete set null,
  add_to_inventory boolean not null default false,
  received_to_inventory_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not add_to_inventory or (inventory_item_id is not null and inventory_location_id is not null))
);

create table if not exists public.purchase_request_audit (
  id bigint generated always as identity primary key,
  purchase_request_id bigint references public.purchase_requests(id) on update cascade on delete cascade,
  action text not null,
  old_status text,
  new_status text,
  changed_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists budget_accounts_program_idx on public.budget_accounts(program_id);
create index if not exists budget_accounts_active_dates_idx on public.budget_accounts(active,starts_on,ends_on);
create index if not exists budget_accounts_created_by_idx on public.budget_accounts(created_by);
create index if not exists budget_accounts_updated_by_idx on public.budget_accounts(updated_by);

create index if not exists purchase_requests_budget_status_idx on public.purchase_requests(budget_id,status);
create index if not exists purchase_requests_program_idx on public.purchase_requests(program_id);
create index if not exists purchase_requests_requested_by_idx on public.purchase_requests(requested_by);
create index if not exists purchase_requests_approved_by_idx on public.purchase_requests(approved_by);
create index if not exists purchase_requests_ordered_by_idx on public.purchase_requests(ordered_by);
create index if not exists purchase_requests_received_by_idx on public.purchase_requests(received_by);
create index if not exists purchase_requests_canceled_by_idx on public.purchase_requests(canceled_by);
create index if not exists purchase_requests_updated_by_idx on public.purchase_requests(updated_by);
create index if not exists purchase_requests_status_created_idx on public.purchase_requests(status,created_at desc);

create index if not exists purchase_request_items_request_idx on public.purchase_request_items(purchase_request_id);
create index if not exists purchase_request_items_inventory_category_idx on public.purchase_request_items(inventory_category_id);
create index if not exists purchase_request_items_inventory_item_idx on public.purchase_request_items(inventory_item_id);
create index if not exists purchase_request_items_inventory_location_idx on public.purchase_request_items(inventory_location_id);

create index if not exists purchase_request_audit_request_time_idx on public.purchase_request_audit(purchase_request_id,changed_at desc);
create index if not exists purchase_request_audit_changed_by_idx on public.purchase_request_audit(changed_by);

alter table public.budget_accounts enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.purchase_request_items enable row level security;
alter table public.purchase_request_audit enable row level security;

revoke all on table public.budget_accounts from anon;
revoke all on table public.purchase_requests from anon;
revoke all on table public.purchase_request_items from anon;
revoke all on table public.purchase_request_audit from anon;

grant select,insert,update,delete on table public.budget_accounts to authenticated;
grant select,insert,update,delete on table public.purchase_requests to authenticated;
grant select,insert,update,delete on table public.purchase_request_items to authenticated;
grant select on table public.purchase_request_audit to authenticated;

grant usage,select on sequence public.budget_accounts_id_seq to authenticated;
grant usage,select on sequence public.purchase_requests_id_seq to authenticated;
grant usage,select on sequence public.purchase_request_items_id_seq to authenticated;
grant usage,select on sequence public.purchase_request_audit_id_seq to authenticated;

create policy "admins can view budgets"
on public.budget_accounts for select to authenticated
using ((select public.current_user_is_admin()));
create policy "admins can insert budgets"
on public.budget_accounts for insert to authenticated
with check ((select public.current_user_is_admin()));
create policy "admins can update budgets"
on public.budget_accounts for update to authenticated
using ((select public.current_user_is_admin()))
with check ((select public.current_user_is_admin()));
create policy "admins can delete budgets"
on public.budget_accounts for delete to authenticated
using ((select public.current_user_is_admin()));

create policy "admins can view purchase requests"
on public.purchase_requests for select to authenticated
using ((select public.current_user_is_admin()));
create policy "admins can insert purchase requests"
on public.purchase_requests for insert to authenticated
with check ((select public.current_user_is_admin()));
create policy "admins can update purchase requests"
on public.purchase_requests for update to authenticated
using ((select public.current_user_is_admin()))
with check ((select public.current_user_is_admin()));
create policy "admins can delete purchase requests"
on public.purchase_requests for delete to authenticated
using ((select public.current_user_is_admin()));

create policy "admins can view purchase request items"
on public.purchase_request_items for select to authenticated
using ((select public.current_user_is_admin()));
create policy "admins can insert purchase request items"
on public.purchase_request_items for insert to authenticated
with check ((select public.current_user_is_admin()));
create policy "admins can update purchase request items"
on public.purchase_request_items for update to authenticated
using ((select public.current_user_is_admin()))
with check ((select public.current_user_is_admin()));
create policy "admins can delete purchase request items"
on public.purchase_request_items for delete to authenticated
using ((select public.current_user_is_admin()));

create policy "admins can view purchase audit"
on public.purchase_request_audit for select to authenticated
using ((select public.current_user_is_admin()));

create or replace function public.touch_budget_purchase_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger budget_accounts_touch
before update on public.budget_accounts
for each row execute function public.touch_budget_purchase_updated_at();

create trigger purchase_requests_touch
before update on public.purchase_requests
for each row execute function public.touch_budget_purchase_updated_at();

create trigger purchase_request_items_touch
before update on public.purchase_request_items
for each row execute function public.touch_budget_purchase_updated_at();

create or replace function public.enforce_purchase_request_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status is distinct from new.status then
    if old.status = 'planned' and new.status not in ('awaiting_approval','canceled') then
      raise exception 'Planned requests can only be submitted for approval or canceled';
    elsif old.status = 'awaiting_approval' and new.status not in ('planned','approved','canceled') then
      raise exception 'Awaiting approval requests can only be returned to planned, approved, or canceled';
    elsif old.status = 'approved' and new.status not in ('ordered','canceled') then
      raise exception 'Approved requests can only be marked ordered or canceled';
    elsif old.status = 'ordered' and new.status not in ('received','canceled') then
      raise exception 'Ordered requests can only be received or canceled';
    elsif old.status in ('received','canceled') then
      raise exception 'Received or canceled requests cannot change status';
    end if;

    if new.status = 'awaiting_approval' then
      new.submitted_at := coalesce(new.submitted_at, now());
    elsif new.status = 'approved' then
      new.approved_by := auth.uid();
      new.approved_at := now();
    elsif new.status = 'ordered' then
      new.ordered_by := auth.uid();
      new.ordered_at := now();
    elsif new.status = 'received' then
      new.received_by := auth.uid();
      new.received_at := now();
    elsif new.status = 'canceled' then
      new.canceled_by := auth.uid();
      new.canceled_at := now();
    end if;
  end if;

  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger purchase_requests_enforce_transition
before update on public.purchase_requests
for each row execute function public.enforce_purchase_request_transition();

create or replace function public.audit_purchase_request_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.purchase_request_audit(purchase_request_id,action,new_status,changed_by)
    values (new.id,'created',new.status,auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.purchase_request_audit(purchase_request_id,action,old_status,new_status,changed_by)
    values (new.id,'status_changed',old.status,new.status,auth.uid());
  end if;
  return new;
end;
$$;

revoke all on function public.audit_purchase_request_status() from public;
revoke all on function public.audit_purchase_request_status() from anon;
revoke all on function public.audit_purchase_request_status() from authenticated;

create trigger purchase_requests_audit
after insert or update of status on public.purchase_requests
for each row execute function public.audit_purchase_request_status();

create or replace function public.enforce_purchase_item_editable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_request_id bigint;
begin
  v_request_id := case when tg_op='DELETE' then old.purchase_request_id else new.purchase_request_id end;

  select status into v_status
  from public.purchase_requests
  where id=v_request_id;

  if v_status in ('received','canceled') then
    raise exception 'Items on received or canceled purchase requests cannot be changed';
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$$;

create trigger purchase_request_items_editable
before insert or update or delete on public.purchase_request_items
for each row execute function public.enforce_purchase_item_editable();

create or replace view public.purchase_request_totals
with (security_invoker = true)
as
select
  pr.id as purchase_request_id,
  coalesce(sum(pri.quantity * pri.estimated_unit_cost),0)::numeric(12,2) as estimated_total,
  coalesce(sum(pri.quantity * coalesce(pri.actual_unit_cost,pri.estimated_unit_cost)),0)::numeric(12,2) as current_total
from public.purchase_requests pr
left join public.purchase_request_items pri on pri.purchase_request_id=pr.id
group by pr.id;

create or replace view public.budget_financial_summary
with (security_invoker = true)
as
select
  b.id as budget_id,
  b.allocated_amount,
  coalesce(sum(case when pr.status in ('approved','ordered')
    then totals.current_total else 0 end),0)::numeric(12,2) as committed_amount,
  coalesce(sum(case when pr.status='received'
    then totals.current_total else 0 end),0)::numeric(12,2) as spent_amount,
  (b.allocated_amount
    - coalesce(sum(case when pr.status in ('approved','ordered') then totals.current_total else 0 end),0)
    - coalesce(sum(case when pr.status='received' then totals.current_total else 0 end),0)
  )::numeric(12,2) as available_amount
from public.budget_accounts b
left join public.purchase_requests pr on pr.budget_id=b.id
left join public.purchase_request_totals totals on totals.purchase_request_id=pr.id
group by b.id,b.allocated_amount;

revoke all on public.purchase_request_totals from anon;
revoke all on public.budget_financial_summary from anon;
grant select on public.purchase_request_totals to authenticated;
grant select on public.budget_financial_summary to authenticated;

create or replace function public.receive_purchase_request(p_request_id bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_request public.purchase_requests;
  v_item record;
  v_inventory_count integer := 0;
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  select *
  into v_request
  from public.purchase_requests
  where id=p_request_id
  for update;

  if not found then
    raise exception 'Purchase request not found';
  end if;

  if v_request.status <> 'ordered' then
    raise exception 'Only ordered purchase requests can be marked received';
  end if;

  if not exists (select 1 from public.purchase_request_items where purchase_request_id=p_request_id) then
    raise exception 'Add at least one line item before receiving this purchase';
  end if;

  for v_item in
    select *
    from public.purchase_request_items
    where purchase_request_id=p_request_id
      and add_to_inventory
  loop
    if v_item.received_to_inventory_at is not null then
      raise exception 'One or more items have already been added to inventory';
    end if;

    perform public.adjust_inventory_stock(
      v_item.inventory_item_id,
      v_item.inventory_location_id,
      'receive',
      v_item.quantity,
      'Received from purchase request #' || p_request_id,
      null
    );

    update public.purchase_request_items
    set received_to_inventory_at=now()
    where id=v_item.id;

    v_inventory_count := v_inventory_count + 1;
  end loop;

  update public.purchase_requests
  set status='received'
  where id=p_request_id
  returning * into v_request;

  return jsonb_build_object(
    'purchase_request_id',p_request_id,
    'status',v_request.status,
    'inventory_items_received',v_inventory_count
  );
end;
$$;

revoke all on function public.receive_purchase_request(bigint) from public;
revoke all on function public.receive_purchase_request(bigint) from anon;
grant execute on function public.receive_purchase_request(bigint) to authenticated;
;