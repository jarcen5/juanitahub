create or replace view public.kiosk_public_birthdays
with (security_invoker = true)
as
select
  c.id as child_id,
  c.first_name,
  extract(month from r.birth_date)::integer as birth_month,
  extract(day from r.birth_date)::integer as birth_day
from public.child_registrations r
join public.children c on c.id = r.child_id
where r.status = 'active'
  and r.birth_date is not null
  and r.show_birthday_publicly = true
  and c.active = true;

revoke all on public.kiosk_public_birthdays from anon;
grant select on public.kiosk_public_birthdays to authenticated;;