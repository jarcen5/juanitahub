
drop policy if exists "admins can delete registration submissions" on public.registration_submissions;
create policy "admins can delete unapproved registration submissions"
on public.registration_submissions
for delete
to authenticated
using (
  (select public.current_user_is_admin())
  and status <> 'approved'
);
;