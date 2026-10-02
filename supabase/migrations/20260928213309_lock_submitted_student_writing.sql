
create or replace function public.lock_submitted_student_writing()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status = 'submitted'
     and new.last_updated_source = 'student'
     and new.status <> 'reviewed' then
    raise exception 'Submitted writing is locked while staff reviews it';
  end if;
  return new;
end;
$$;

drop trigger if exists lock_submitted_student_writing_changes on public.learning_writing_submissions;
create trigger lock_submitted_student_writing_changes
before update on public.learning_writing_submissions
for each row execute function public.lock_submitted_student_writing();

revoke all on function public.lock_submitted_student_writing() from public, anon;
grant execute on function public.lock_submitted_student_writing() to authenticated;
;