create or replace function public.preserve_child_profile_creator()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.created_by = old.created_by;
  return new;
end;
$$;
revoke all on function public.preserve_child_profile_creator() from public, anon, authenticated;

create trigger child_registrations_preserve_creator before update on public.child_registrations for each row execute function public.preserve_child_profile_creator();
create trigger child_guardians_preserve_creator before update on public.child_guardians for each row execute function public.preserve_child_profile_creator();
create trigger child_health_info_preserve_creator before update on public.child_health_info for each row execute function public.preserve_child_profile_creator();
create trigger child_authorized_pickups_preserve_creator before update on public.child_authorized_pickups for each row execute function public.preserve_child_profile_creator();
create trigger child_registration_agreements_preserve_creator before update on public.child_registration_agreements for each row execute function public.preserve_child_profile_creator();;