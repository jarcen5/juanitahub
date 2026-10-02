create or replace function public.preserve_center_announcement_creator()
returns trigger
language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  new.created_by = old.created_by;
  return new;
end;
$$;

drop trigger if exists center_announcements_preserve_creator on public.center_announcements;
create trigger center_announcements_preserve_creator
before update on public.center_announcements
for each row execute function public.preserve_center_announcement_creator();
