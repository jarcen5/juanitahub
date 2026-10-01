create or replace function public.resync_purchase_list_budget()
returns trigger
language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  if new.budget_id is distinct from old.budget_id then
    update public.purchase_request_items
    set category_tag = category_tag
    where purchase_request_id = new.id;
  end if;
  return new;
end;
$$;
