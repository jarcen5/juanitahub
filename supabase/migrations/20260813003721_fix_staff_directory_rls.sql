create or replace function public.current_user_is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles
    where user_id = auth.uid()
      and active
  );
$$;

revoke all on function public.current_user_is_active_staff() from public;
revoke all on function public.current_user_is_active_staff() from anon;
grant execute on function public.current_user_is_active_staff() to authenticated;

drop policy if exists "active staff can view active staff directory" on public.staff_profiles;

create policy "active staff can view active staff directory"
on public.staff_profiles
for select
to authenticated
using (active and public.current_user_is_active_staff());;