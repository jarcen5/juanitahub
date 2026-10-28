-- Admin-only reversal of accidental monthly wheel spins.
-- Preserve an audit record before removing the erroneous win and return stock atomically.
create table if not exists public.reward_spin_revocations (
  id bigint generated always as identity primary key,
  original_win_id bigint not null unique,
  child_id bigint not null,
  month_start date not null,
  prize_id bigint not null,
  prize_name text not null,
  spin_number integer not null,
  reason text not null check (length(btrim(reason)) >= 5),
  revoked_by uuid not null,
  revoked_at timestamptz not null default now()
);
alter table public.reward_spin_revocations enable row level security;
revoke all on public.reward_spin_revocations from anon, authenticated;
grant select on public.reward_spin_revocations to authenticated;
drop policy if exists "admins can read spin revocations" on public.reward_spin_revocations;
create policy "admins can read spin revocations" on public.reward_spin_revocations
for select to authenticated using (public.current_user_is_admin());

create or replace function public.revoke_accidental_monthly_spin(p_win_id bigint, p_reason text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  w public.prize_wins%rowtype;
  v_received timestamptz;
  v_stock_id bigint;
begin
  if auth.uid() is null or not public.current_user_is_admin() then
    raise exception 'Only administrators may revoke spins';
  end if;
  if length(btrim(coalesce(p_reason,''))) < 5 then
    raise exception 'Provide a brief reason for the correction';
  end if;
  select * into w from public.prize_wins where id=p_win_id;
  if not found then raise exception 'Spin record was not found'; end if;
  perform 1 from public.children where id=w.child_id for update;
  select * into w from public.prize_wins where id=p_win_id for update;
  if not found then raise exception 'Spin was already revoked'; end if;
  select f.received_at into v_received
  from public.reward_prize_fulfillment f
  where f.source='monthly' and f.win_id=w.id;
  if v_received is not null then
    raise exception 'This prize has already been marked received; correct fulfillment first';
  end if;

  select id into v_stock_id from public.wheel_stock
  where prize_id=w.prize_id for update;
  if v_stock_id is null then raise exception 'Prize stock row not found'; end if;
  if not exists (
    select 1 from public.wheel_stock where id=v_stock_id and quantity_remaining < quantity_start
  ) then raise exception 'Cannot restore stock above its starting quantity'; end if;

  insert into public.reward_spin_revocations
    (original_win_id,child_id,month_start,prize_id,prize_name,spin_number,reason,revoked_by)
  values
    (w.id,w.child_id,w.month_start,w.prize_id,w.prize_name_snapshot,w.spin_number,btrim(p_reason),auth.uid());

  delete from public.prize_wins where id=w.id;
  update public.wheel_stock set quantity_remaining=quantity_remaining+1,updated_at=now() where id=v_stock_id;
end;
$$;
revoke execute on function public.revoke_accidental_monthly_spin(bigint,text) from public, anon;
grant execute on function public.revoke_accidental_monthly_spin(bigint,text) to authenticated;
