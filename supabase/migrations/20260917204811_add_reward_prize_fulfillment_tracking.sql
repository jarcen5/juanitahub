alter table public.prize_wins
  add column if not exists received_at timestamptz,
  add column if not exists received_by uuid references auth.users(id) on delete set null;

alter table public.free_prize_wins
  add column if not exists received_at timestamptz,
  add column if not exists received_by uuid references auth.users(id) on delete set null;

create index if not exists prize_wins_unreceived_month_idx
  on public.prize_wins(month_start, child_id)
  where received_at is null;

create index if not exists free_prize_wins_unreceived_month_idx
  on public.free_prize_wins(month_start, child_id)
  where received_at is null;

drop policy if exists "active staff can update prize fulfillment" on public.prize_wins;
create policy "active staff can update prize fulfillment"
on public.prize_wins
for update
to authenticated
using ((select public.current_user_is_active_staff()))
with check ((select public.current_user_is_active_staff()));

drop policy if exists "active staff can update free prize fulfillment" on public.free_prize_wins;
create policy "active staff can update free prize fulfillment"
on public.free_prize_wins
for update
to authenticated
using ((select public.current_user_is_active_staff()))
with check ((select public.current_user_is_active_staff()));

grant update (received_at, received_by) on public.prize_wins to authenticated;
grant update (received_at, received_by) on public.free_prize_wins to authenticated;
revoke update on public.prize_wins from anon;
revoke update on public.free_prize_wins from anon;

create or replace view public.reward_prize_fulfillment
with (security_invoker = true)
as
select
  'monthly'::text as source,
  w.id as win_id,
  w.child_id,
  c.first_name,
  c.last_name,
  w.month_start,
  w.prize_name_snapshot as prize_name,
  w.category_name_snapshot as category_name,
  w.tier_name_snapshot as tier_name,
  null::text as reason,
  w.won_at,
  w.received_at,
  w.received_by
from public.prize_wins w
join public.children c on c.id = w.child_id
union all
select
  'free'::text as source,
  w.id as win_id,
  w.child_id,
  c.first_name,
  c.last_name,
  w.month_start,
  w.prize_name_snapshot as prize_name,
  w.category_name_snapshot as category_name,
  w.tier_name_snapshot as tier_name,
  w.reason,
  w.won_at,
  w.received_at,
  w.received_by
from public.free_prize_wins w
join public.children c on c.id = w.child_id;

grant select on public.reward_prize_fulfillment to authenticated;
revoke all on public.reward_prize_fulfillment from anon;;