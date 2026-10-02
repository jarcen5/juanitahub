drop policy if exists "staff can view own profile" on public.staff_profiles;
create policy "active staff can view own profile"
on public.staff_profiles
for select
to authenticated
using (user_id = auth.uid() and active);;