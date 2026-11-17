-- Staff-approved optional Learning Choice Board.
-- No production data is modified by adding this migration to the review branch.
-- An approved catalog entry is an offer, NOT an assigned student task.

create table if not exists public.learning_choice_board_items (
  assignment_id bigint primary key references public.learning_assignments(id) on delete cascade,
  enabled boolean not null default true,
  allowed_levels text[] not null default '{}'::text[],
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learning_choice_board_students (
  child_id bigint primary key references public.children(id) on delete cascade,
  enabled boolean not null default false,
  learning_level text,
  weekly_limit smallint not null default 2 check (weekly_limit between 0 and 3),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

-- Keep authorized student choice separate from required staff/recurring work.
-- 'assigned_by' remains the real staff member who approved the published item.
alter table public.learning_student_assignments
  add column if not exists assignment_origin text not null default 'staff',
  add column if not exists is_optional boolean not null default false,
  add column if not exists student_choice_at timestamptz;

alter table public.learning_student_assignments
  add constraint learning_student_assignments_origin_check
    check (assignment_origin in ('staff','student_choice')),
  add constraint learning_student_assignments_choice_valid
    check (assignment_origin <> 'student_choice' or (is_optional and student_choice_at is not null));

create index if not exists learning_student_assignments_optional_week_idx
  on public.learning_student_assignments(child_id,week_start,assignment_origin);

-- No self-service Data API writes: active staff manage approved catalog and per-child settings.
alter table public.learning_choice_board_items enable row level security;
alter table public.learning_choice_board_students enable row level security;

revoke all on public.learning_choice_board_items from anon;
revoke all on public.learning_choice_board_students from anon;
grant select, insert, update, delete on public.learning_choice_board_items to authenticated;
grant select, insert, update, delete on public.learning_choice_board_students to authenticated;
grant all on public.learning_choice_board_items to service_role;
grant all on public.learning_choice_board_students to service_role;

create policy "active staff read choice board catalog"
  on public.learning_choice_board_items for select to authenticated
  using ((select public.current_user_is_active_staff()));
create policy "active staff publish choice board items"
  on public.learning_choice_board_items for insert to authenticated
  with check ((select public.current_user_is_active_staff()) and approved_by = (select auth.uid()));
create policy "active staff revise choice board items"
  on public.learning_choice_board_items for update to authenticated
  using ((select public.current_user_is_active_staff()))
  with check ((select public.current_user_is_active_staff()));
create policy "active staff delete choice board items"
  on public.learning_choice_board_items for delete to authenticated
  using ((select public.current_user_is_active_staff()));

create policy "active staff read choice board access"
  on public.learning_choice_board_students for select to authenticated
  using ((select public.current_user_is_active_staff()));
create policy "active staff configure choice board access"
  on public.learning_choice_board_students for insert to authenticated
  with check ((select public.current_user_is_active_staff()) and updated_by = (select auth.uid()));
create policy "active staff edit choice board access"
  on public.learning_choice_board_students for update to authenticated
  using ((select public.current_user_is_active_staff()))
  with check ((select public.current_user_is_active_staff()));
create policy "active staff remove choice board access"
  on public.learning_choice_board_students for delete to authenticated
  using ((select public.current_user_is_active_staff()));

-- Called by Student Learning Edge Function ONLY after a validated student session
-- and activated lab-device check. Row lock serializes concurrent student choices.
create or replace function public.claim_learning_choice(
  p_child_id bigint,
  p_assignment_id bigint,
  p_week_start date
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_child bigint;
  v_level text;
  v_registered_level text;
  v_enabled boolean;
  v_weekly_limit integer;
  v_item public.learning_choice_board_items%rowtype;
  v_activity public.learning_assignments%rowtype;
  v_current_week date;
  v_used integer;
  v_new_id bigint;
begin
  v_current_week := (now() at time zone 'America/New_York')::date;
  v_current_week := v_current_week - (extract(isodow from v_current_week)::integer - 1);
  if p_week_start is null or p_week_start <> v_current_week then
    raise exception 'Choose activities for the current week only.';
  end if;

  select c.id into v_child from public.children c
  where c.id = p_child_id and c.active
  for update;
  if v_child is null then raise exception 'Student profile is not active.'; end if;
  if not exists (
    select 1 from public.learning_student_access access
    where access.child_id = p_child_id and access.enabled
  ) then
    raise exception 'Student Learning access is not enabled.';
  end if;

  select enabled, weekly_limit, learning_level
  into v_enabled, v_weekly_limit, v_level
  from public.learning_choice_board_students where child_id = p_child_id;
  if not coalesce(v_enabled,false) or coalesce(v_weekly_limit,0)=0 then
    raise exception 'This student Choice Board is not enabled.';
  end if;

  select r.grade into v_registered_level
  from public.child_registrations r
  where r.child_id = p_child_id and r.status = 'active'
  order by r.registered_at desc limit 1;
  v_level := coalesce(nullif(btrim(v_level), ''), nullif(btrim(v_registered_level),''));
  if v_level is null then
    raise exception 'Ask staff to set your learning level before choosing an activity.';
  end if;

  select * into v_item from public.learning_choice_board_items i
  where i.assignment_id = p_assignment_id and i.enabled;
  if not found then raise exception 'That activity is not available on your Choice Board.'; end if;

  select * into v_activity from public.learning_assignments a
  where a.id = p_assignment_id and a.active and a.assignment_type in ('typing','quiz','writing','reading')
    and a.delivery_format in ('digital','either')
    and coalesce(a.activity_config->>'experience','') <> 'juanita_quest';
  if not found then raise exception 'That activity is not available for independent practice.'; end if;
  if cardinality(v_item.allowed_levels)>0 and not (v_level = any(v_item.allowed_levels)) then
    raise exception 'This activity is not approved for your learning level.';
  end if;

  -- Existing scheduled recurring, teacher-assigned or optional work wins.
  if exists (
    select 1 from public.learning_student_assignments a
    where a.child_id=p_child_id and a.assignment_id=p_assignment_id and a.week_start=p_week_start
  ) then
    raise exception 'That activity is already on your list this week.';
  end if;

  select count(*) into v_used from public.learning_student_assignments a
  where a.child_id=p_child_id and a.week_start=p_week_start and a.assignment_origin='student_choice';
  if v_used>=v_weekly_limit then
    raise exception 'You already picked your weekly activities. Great job!';
  end if;

  insert into public.learning_student_assignments (
    child_id, assignment_id, week_start, due_date, status, assigned_by,
    updated_by, last_updated_source, assignment_origin, is_optional, student_choice_at
  ) values (
    p_child_id, p_assignment_id, p_week_start, null, 'assigned', v_item.approved_by,
    null, 'student', 'student_choice', true, now()
  ) returning id into v_new_id;

  return jsonb_build_object('ok', true, 'student_assignment_id', v_new_id,
    'remaining_choices',greatest(0,v_weekly_limit-v_used-1));
end;
$$;

revoke all on function public.claim_learning_choice(bigint,bigint,date) from public, anon, authenticated;
grant execute on function public.claim_learning_choice(bigint,bigint,date) to service_role;

comment on function public.claim_learning_choice(bigint,bigint,date)
is 'Accept a staff-approved student optional choice. Call from verified Student Learning service-role Edge Function only; not exposed to students as a direct RPC.';
