alter table public.prize_wins
  alter column prize_id drop not null;

alter table public.prize_wins
  drop constraint if exists prize_wins_prize_id_fkey;

alter table public.prize_wins
  add constraint prize_wins_prize_id_fkey
  foreign key (prize_id)
  references public.wheel_prizes(id)
  on delete set null;;