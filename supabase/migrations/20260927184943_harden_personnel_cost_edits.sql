
create or replace function public.enforce_personnel_cost_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status in ('paid','canceled') then
    raise exception 'Paid or canceled personnel costs cannot be changed';
  end if;

  if old.status='awaiting_approval' then
    if new.budget_id is distinct from old.budget_id
       or new.program_id is distinct from old.program_id
       or new.team_member_id is distinct from old.team_member_id
       or new.worker_name is distinct from old.worker_name
       or new.role_label is distinct from old.role_label
       or new.compensation_type is distinct from old.compensation_type
       or new.rate_amount is distinct from old.rate_amount
       or new.planned_hours is distinct from old.planned_hours
       or new.planned_amount is distinct from old.planned_amount
       or new.work_starts_on is distinct from old.work_starts_on
       or new.work_ends_on is distinct from old.work_ends_on then
      raise exception 'Return this personnel cost to Planned before changing the pay plan';
    end if;
  end if;

  if old.status='approved' then
    if new.budget_id is distinct from old.budget_id
       or new.program_id is distinct from old.program_id
       or new.team_member_id is distinct from old.team_member_id
       or new.worker_name is distinct from old.worker_name
       or new.role_label is distinct from old.role_label
       or new.compensation_type is distinct from old.compensation_type
       or new.rate_amount is distinct from old.rate_amount
       or new.planned_hours is distinct from old.planned_hours
       or new.planned_amount is distinct from old.planned_amount
       or new.work_starts_on is distinct from old.work_starts_on
       or new.work_ends_on is distinct from old.work_ends_on then
      raise exception 'Approved pay-plan fields cannot be changed';
    end if;
  end if;

  if old.status is distinct from new.status then
    if old.status='planned' and new.status not in ('awaiting_approval','canceled') then
      raise exception 'Planned personnel costs can only be submitted for approval or canceled';
    elsif old.status='awaiting_approval' and new.status not in ('planned','approved','canceled') then
      raise exception 'Awaiting approval personnel costs can only be returned to planned, approved, or canceled';
    elsif old.status='approved' and new.status not in ('paid','canceled') then
      raise exception 'Approved personnel costs can only be marked paid or canceled';
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
;