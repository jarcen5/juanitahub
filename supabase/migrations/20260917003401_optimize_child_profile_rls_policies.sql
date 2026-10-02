drop policy if exists "admins can manage child registrations" on public.child_registrations;
drop policy if exists "admins can add child registrations" on public.child_registrations;
drop policy if exists "admins can update child registrations" on public.child_registrations;
drop policy if exists "admins can delete child registrations" on public.child_registrations;
create policy "admins can add child registrations" on public.child_registrations for insert to authenticated
with check ((select public.current_user_is_admin()) and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
create policy "admins can update child registrations" on public.child_registrations for update to authenticated
using ((select public.current_user_is_admin()))
with check ((select public.current_user_is_admin()));
create policy "admins can delete child registrations" on public.child_registrations for delete to authenticated
using ((select public.current_user_is_admin()));

drop policy if exists "admins can manage child guardians" on public.child_guardians;
drop policy if exists "admins can add child guardians" on public.child_guardians;
drop policy if exists "admins can update child guardians" on public.child_guardians;
drop policy if exists "admins can delete child guardians" on public.child_guardians;
create policy "admins can add child guardians" on public.child_guardians for insert to authenticated
with check ((select public.current_user_is_admin()) and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
create policy "admins can update child guardians" on public.child_guardians for update to authenticated
using ((select public.current_user_is_admin()))
with check ((select public.current_user_is_admin()));
create policy "admins can delete child guardians" on public.child_guardians for delete to authenticated
using ((select public.current_user_is_admin()));

drop policy if exists "admins can manage child health info" on public.child_health_info;
drop policy if exists "admins can add child health info" on public.child_health_info;
drop policy if exists "admins can update child health info" on public.child_health_info;
drop policy if exists "admins can delete child health info" on public.child_health_info;
create policy "admins can add child health info" on public.child_health_info for insert to authenticated
with check ((select public.current_user_is_admin()) and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
create policy "admins can update child health info" on public.child_health_info for update to authenticated
using ((select public.current_user_is_admin()))
with check ((select public.current_user_is_admin()));
create policy "admins can delete child health info" on public.child_health_info for delete to authenticated
using ((select public.current_user_is_admin()));;