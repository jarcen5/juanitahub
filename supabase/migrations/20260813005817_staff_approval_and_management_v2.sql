create or replace function public.current_user_is_admin()
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
      and role = 'admin'
  );
$$;

revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to authenticated;

create table if not exists public.staff_accounts (
  user_id uuid primary key references public.staff_profiles(user_id) on delete cascade,
  email text not null,
  requested_name text not null,
  created_at timestamptz not null default now()
);

alter table public.staff_accounts enable row level security;

drop policy if exists "admins can view staff account details" on public.staff_accounts;
create policy "admins can view staff account details"
on public.staff_accounts
for select
to authenticated
using (public.current_user_is_admin());

drop policy if exists "admins can view all staff profiles" on public.staff_profiles;
create policy "admins can view all staff profiles"
on public.staff_profiles
for select
to authenticated
using (public.current_user_is_admin());

drop policy if exists "admins can update staff profiles" on public.staff_profiles;
create policy "admins can update staff profiles"
on public.staff_profiles
for update
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

create or replace function public.handle_new_staff_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text;
begin
  requested := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  if requested is null then
    requested := split_part(coalesce(new.email, 'Staff'), '@', 1);
  end if;

  insert into public.staff_profiles (user_id, display_name, role, active)
  values (new.id, requested, 'staff', false)
  on conflict (user_id) do nothing;

  insert into public.staff_accounts (user_id, email, requested_name)
  values (new.id, coalesce(new.email, ''), requested)
  on conflict (user_id) do update
    set email = excluded.email,
        requested_name = excluded.requested_name;

  return new;
end;
$$;

revoke all on function public.handle_new_staff_account() from public;

drop trigger if exists on_auth_user_created_staff_request on auth.users;
create trigger on_auth_user_created_staff_request
after insert on auth.users
for each row execute function public.handle_new_staff_account();

create or replace function public.protect_last_active_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.active and old.role = 'admin'
     and (not new.active or new.role <> 'admin') then
    if not exists (
      select 1 from public.staff_profiles
      where user_id <> old.user_id
        and active
        and role = 'admin'
    ) then
      raise exception 'Juanita Hub must always have at least one active administrator.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_last_active_admin() from public;

drop trigger if exists protect_last_admin_before_update on public.staff_profiles;
create trigger protect_last_admin_before_update
before update of role, active on public.staff_profiles
for each row execute function public.protect_last_active_admin();

insert into public.staff_accounts (user_id, email, requested_name)
select sp.user_id, au.email, sp.display_name
from public.staff_profiles sp
join auth.users au on au.id = sp.user_id
where au.email is not null
on conflict (user_id) do update
set email = excluded.email,
    requested_name = excluded.requested_name;;