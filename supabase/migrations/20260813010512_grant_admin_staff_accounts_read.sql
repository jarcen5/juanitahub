grant select on table public.staff_accounts to authenticated;
revoke insert, update, delete on table public.staff_accounts from authenticated, anon;
revoke select on table public.staff_accounts from anon;;