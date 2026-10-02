
grant insert on public.learning_lab_devices to authenticated;

drop policy if exists "admins can activate learning lab devices" on public.learning_lab_devices;
create policy "admins can activate learning lab devices"
on public.learning_lab_devices
for insert
to authenticated
with check (
  (select public.current_user_is_admin())
  and created_by = (select auth.uid())
);
;