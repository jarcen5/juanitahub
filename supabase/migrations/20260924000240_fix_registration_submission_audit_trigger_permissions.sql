
create or replace function public.audit_registration_submission_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.registration_submission_audit(submission_id, action, new_status, changed_by)
    values (new.id, 'submitted', new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.registration_submission_audit(submission_id, action, old_status, new_status, changed_by)
    values (
      new.id,
      case
        when new.status = 'approved' then 'approved'
        when new.status = 'declined' then 'declined'
        else 'status_changed'
      end,
      old.status,
      new.status,
      coalesce(new.reviewed_by, auth.uid())
    );
  end if;
  return new;
end;
$$;

revoke all on function public.audit_registration_submission_status() from public;
revoke all on function public.audit_registration_submission_status() from anon;
revoke all on function public.audit_registration_submission_status() from authenticated;
;