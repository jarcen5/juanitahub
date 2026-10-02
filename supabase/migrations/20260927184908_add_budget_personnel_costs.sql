
create table if not exists public.budget_personnel_costs (
  id bigint generated always as identity primary key,
  budget_id bigint not null references public.budget_accounts(id) on update cascade on delete restrict,
  program_id bigint references public.programs(id) on update cascade on delete set null,
  team_member_id bigint references public.team_members(id) on update cascade on delete set null,
  worker_name text not null check (char_length(btrim(worker_name)) between 1 and 160),
  role_label text,
  compensation_type text not null default 'hourly'
    check (compensation_type in ('hourly','stipend','flat')),
  rate_amount numeric(12,2) check (rate_amount is null or rate_amount >= 0),
  planned_hours numeric(12,2) check (planned_hours is null or planned_hours >= 0),
  actual_hours numeric(12,2) check (actual_hours is null or actual_hours >= 0),
  planned_amount numeric(12,2) not null default 0 check (planned_amount >= 0),
  paid_amount numeric(12,2) check (paid_amount is null or paid_amount >= 0),
  status text not null default 'planned'
    check (status in ('planned','awaiting_approval','approved','paid','canceled')),
  work_starts_on date,
  work_ends_on date,
  notes text,
  created_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  updated_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  submitted_at timestamptz,
  approved_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  approved_at timestamptz,
  paid_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  paid_at timestamptz,
  canceled_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (work_ends_on is null or work_starts_on is null or work_ends_on >= work_starts_on)
);

create table if not exists public.budget_personnel_audit (
  id bigint generated always as identity primary key,
  personnel_cost_id bigint references public.budget_personnel_costs(id) on update cascade on delete cascade,
  action text not null,
  old_status text,
  new_status text,
  changed_by uuid references public.staff_profiles(user_id) on update cascade on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists budget_personnel_costs_budget_status_idx on public.budget_personnel_costs(budget_id,status);
create index if not exists budget_personnel_costs_program_idx on public.budget_personnel_costs(program_id);
create index if not exists budget_personnel_costs_team_member_idx on public.budget_personnel_costs(team_member_id);
create index if not exists budget_personnel_costs_created_by_idx on public.budget_personnel_costs(created_by);
create index if not exists budget_personnel_costs_updated_by_idx on public.budget_personnel_costs(updated_by);
create index if not exists budget_personnel_costs_approved_by_idx on public.budget_personnel_costs(approved_by);
create index if not exists budget_personnel_costs_paid_by_idx on public.budget_personnel_costs(paid_by);
create index if not exists budget_personnel_costs_canceled_by_idx on public.budget_personnel_costs(canceled_by);
create index if not exists budget_personnel_audit_cost_time_idx on public.budget_personnel_audit(personnel_cost_id,changed_at desc);
create index if not exists budget_personnel_audit_changed_by_idx on public.budget_personnel_audit(changed_by);

alter table public.budget_personnel_costs enable row level security;
alter table public.budget_personnel_audit enable row level security;

revoke all on table public.budget_personnel_costs from anon;
revoke all on table public.budget_personnel_audit from anon;

grant select,insert,update,delete on table public.budget_personnel_costs to authenticated;
grant select on table public.budget_personnel_audit to authenticated;

grant usage,select on sequence public.budget_personnel_costs_id_seq to authenticated;
grant usage,select on sequence public.budget_personnel_audit_id_seq to authenticated;

create policy "admins can view personnel costs"
on public.budget_personnel_costs for select to authenticated
using ((select public.current_user_is_admin()));

create policy "admins can insert personnel costs"
on public.budget_personnel_costs for insert to authenticated
with check ((select public.current_user_is_admin()));

create policy "admins can update personnel costs"
on public.budget_personnel_costs for update to authenticated
using ((select public.current_user_is_admin()))
with check ((select public.current_user_is_admin()));

create policy "admins can delete unfinalized personnel costs"
on public.budget_personnel_costs for delete to authenticated
using ((select public.current_user_is_admin()) and status <> 'paid');

create policy "admins can view personnel audit"
on public.budget_personnel_audit for select to authenticated
using ((select public.current_user_is_admin()));

create trigger budget_personnel_costs_touch
before update on public.budget_personnel_costs
for each row execute function public.touch_budget_purchase_updated_at();

create or replace function public.enforce_personnel_cost_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status is distinct from new.status then
    if old.status='planned' and new.status not in ('awaiting_approval','canceled') then
      raise exception 'Planned personnel costs can only be submitted for approval or canceled';
    elsif old.status='awaiting_approval' and new.status not in ('planned','approved','canceled') then
      raise exception 'Awaiting approval personnel costs can only be returned to planned, approved, or canceled';
    elsif old.status='approved' and new.status not in ('paid','canceled') then
      raise exception 'Approved personnel costs can only be marked paid or canceled';
    elsif old.status in ('paid','canceled') then
      raise exception 'Paid or canceled personnel costs cannot change status';
    end if;

    if new.status='awaiting_approval' then
      new.submitted_at := coalesce(new.submitted_at,now());
    elsif new.status='approved' then
      new.approved_by := auth.uid();
      new.approved_at := now();
    elsif new.status='paid' then
      if new.paid_amount is null then
        new.paid_amount := new.planned_amount;
      end if;
      new.paid_by := auth.uid();
      new.paid_at := now();
    elsif new.status='canceled' then
      new.canceled_by := auth.uid();
      new.canceled_at := now();
    end if;
  end if;

  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger budget_personnel_costs_enforce_transition
before update on public.budget_personnel_costs
for each row execute function public.enforce_personnel_cost_transition();

create or replace function public.audit_personnel_cost_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op='INSERT' then
    insert into public.budget_personnel_audit(personnel_cost_id,action,new_status,changed_by)
    values (new.id,'created',new.status,auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.budget_personnel_audit(personnel_cost_id,action,old_status,new_status,changed_by)
    values (new.id,'status_changed',old.status,new.status,auth.uid());
  end if;
  return new;
end;
$$;

revoke all on function public.audit_personnel_cost_status() from public;
revoke all on function public.audit_personnel_cost_status() from anon;
revoke all on function public.audit_personnel_cost_status() from authenticated;

create trigger budget_personnel_costs_audit
after insert or update of status on public.budget_personnel_costs
for each row execute function public.audit_personnel_cost_status();

create or replace view public.budget_financial_summary
with (security_invoker = true)
as
with purchase_totals as (
  select
    pr.budget_id,
    coalesce(sum(case when pr.status in ('approved','ordered') then totals.current_total else 0 end),0)::numeric(12,2) as purchase_committed,
    coalesce(sum(case when pr.status='received' then totals.current_total else 0 end),0)::numeric(12,2) as purchase_spent
  from public.purchase_requests pr
  left join public.purchase_request_totals totals on totals.purchase_request_id=pr.id
  group by pr.budget_id
),
personnel_totals as (
  select
    pc.budget_id,
    coalesce(sum(case when pc.status='approved' then pc.planned_amount else 0 end),0)::numeric(12,2) as personnel_committed,
    coalesce(sum(case when pc.status='paid' then coalesce(pc.paid_amount,pc.planned_amount) else 0 end),0)::numeric(12,2) as personnel_spent
  from public.budget_personnel_costs pc
  group by pc.budget_id
)
select
  b.id as budget_id,
  b.allocated_amount,
  (coalesce(pt.purchase_committed,0)+coalesce(pet.personnel_committed,0))::numeric(12,2) as committed_amount,
  (coalesce(pt.purchase_spent,0)+coalesce(pet.personnel_spent,0))::numeric(12,2) as spent_amount,
  (
    b.allocated_amount
    - coalesce(pt.purchase_committed,0)
    - coalesce(pet.personnel_committed,0)
    - coalesce(pt.purchase_spent,0)
    - coalesce(pet.personnel_spent,0)
  )::numeric(12,2) as available_amount
from public.budget_accounts b
left join purchase_totals pt on pt.budget_id=b.id
left join personnel_totals pet on pet.budget_id=b.id;

revoke all on public.budget_financial_summary from anon;
grant select on public.budget_financial_summary to authenticated;
;