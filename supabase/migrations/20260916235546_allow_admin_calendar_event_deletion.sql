create policy "admins can delete calendar events"
on public.calendar_events
for delete
to authenticated
using ((select current_user_is_admin()));;