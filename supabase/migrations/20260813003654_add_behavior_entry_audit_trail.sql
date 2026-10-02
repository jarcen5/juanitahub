create table if not exists public.behavior_entry_audit (
  id bigint generated always as identity primary key,
  behavior_entry_id bigint not null,
  child_id bigint not null references public.children(id),
  entry_date date not null,
  action text not null check (action in ('created', 'updated', 'deleted')),
  old_entry jsonb,
  new_entry jsonb,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists behavior_entry_audit_entry_id_idx
  on public.behavior_entry_audit (behavior_entry_id, changed_at desc);
create index if not exists behavior_entry_audit_child_month_idx
  on public.behavior_entry_audit (child_id, entry_date, changed_at desc);

alter table public.behavior_entry_audit enable row level security;

revoke all on table public.behavior_entry_audit from anon;
revoke all on table public.behavior_entry_audit from authenticated;
grant select on table public.behavior_entry_audit to authenticated;

create policy "active staff can view behavior entry audit"
on public.behavior_entry_audit
for select
to authenticated
using (
  exists (
    select 1 from public.staff_profiles sp
    where sp.user_id = (select auth.uid())
      and sp.active
  )
);

create policy "active staff can view active staff directory"
on public.staff_profiles
for select
to authenticated
using (
  active
  and exists (
    select 1 from public.staff_profiles viewer
    where viewer.user_id = (select auth.uid())
      and viewer.active
  )
);

create or replace function public.audit_behavior_entry_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.behavior_entry_audit (
      behavior_entry_id, child_id, entry_date, action, old_entry, new_entry, changed_by
    ) values (
      new.id, new.child_id, new.entry_date, 'created', null, to_jsonb(new), auth.uid()
    );
    return new;
  elsif tg_op = 'UPDATE' then
    if old is distinct from new then
      insert into public.behavior_entry_audit (
        behavior_entry_id, child_id, entry_date, action, old_entry, new_entry, changed_by
      ) values (
        new.id, new.child_id, new.entry_date, 'updated', to_jsonb(old), to_jsonb(new), auth.uid()
      );
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.behavior_entry_audit (
      behavior_entry_id, child_id, entry_date, action, old_entry, new_entry, changed_by
    ) values (
      old.id, old.child_id, old.entry_date, 'deleted', to_jsonb(old), null, auth.uid()
    );
    return old;
  end if;

  return null;
end;
$$;

revoke all on function public.audit_behavior_entry_changes() from public;
revoke all on function public.audit_behavior_entry_changes() from anon;
revoke all on function public.audit_behavior_entry_changes() from authenticated;

create trigger behavior_entries_audit_trigger
after insert or update or delete on public.behavior_entries
for each row execute function public.audit_behavior_entry_changes();;