alter table public.child_profile_audit drop constraint if exists child_profile_audit_area_check;
alter table public.child_profile_audit add constraint child_profile_audit_area_check check (area in ('registration','guardian','health','pickup','agreement'));

create or replace function public.audit_child_pickup_change()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_child_id bigint;
  v_registration_id bigint;
begin
  v_registration_id := coalesce(new.registration_id, old.registration_id);
  select child_id into v_child_id from public.child_registrations where id = v_registration_id;
  if v_child_id is null then return coalesce(new, old); end if;

  insert into public.child_profile_audit(child_id, registration_id, area, action, changed_by)
  values (v_child_id, v_registration_id, 'pickup', lower(tg_op), auth.uid());
  return coalesce(new, old);
end;
$$;

create or replace function public.audit_child_agreement_change()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_child_id bigint;
  v_registration_id bigint;
begin
  v_registration_id := coalesce(new.registration_id, old.registration_id);
  select child_id into v_child_id from public.child_registrations where id = v_registration_id;
  if v_child_id is null then return coalesce(new, old); end if;

  insert into public.child_profile_audit(child_id, registration_id, area, action, changed_by)
  values (v_child_id, v_registration_id, 'agreement', lower(tg_op), auth.uid());
  return coalesce(new, old);
end;
$$;

revoke all on function public.audit_child_pickup_change() from public, anon, authenticated;
revoke all on function public.audit_child_agreement_change() from public, anon, authenticated;

create trigger child_authorized_pickups_set_updated before update on public.child_authorized_pickups
for each row execute function public.set_child_profile_updated_fields();
create trigger child_authorized_pickups_audit after insert or update or delete on public.child_authorized_pickups
for each row execute function public.audit_child_pickup_change();

create trigger child_registration_agreements_set_updated before update on public.child_registration_agreements
for each row execute function public.set_child_profile_updated_fields();
create trigger child_registration_agreements_audit after insert or update or delete on public.child_registration_agreements
for each row execute function public.audit_child_agreement_change();;