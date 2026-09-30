
create or replace function public.ensure_learning_access_for_child()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.learning_student_access(child_id, enabled, updated_by)
  values (new.id, true, auth.uid())
  on conflict (child_id) do nothing;
  return new;
end;
$$;

drop trigger if exists children_learning_access_default on public.children;
create trigger children_learning_access_default
after insert on public.children
for each row execute function public.ensure_learning_access_for_child();

revoke all on function public.ensure_learning_access_for_child() from public, anon;
grant execute on function public.ensure_learning_access_for_child() to authenticated;
;