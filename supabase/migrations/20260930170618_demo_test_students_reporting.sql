
alter table public.children
  add column if not exists is_demo boolean not null default false;

create or replace function public.create_student_profile_v2(
  p_first_name text,
  p_last_name text,
  p_birth_date date,
  p_school text,
  p_grade text,
  p_school_year text,
  p_is_demo boolean default false
)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_child_id bigint;
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;
  if nullif(trim(p_first_name), '') is null then
    raise exception 'First name is required';
  end if;
  if p_birth_date is null then
    raise exception 'Birthday is required for Student Learning access';
  end if;
  if nullif(trim(p_school_year), '') is null then
    raise exception 'School year is required';
  end if;

  insert into public.children(first_name,last_name,active,is_demo)
  values (
    trim(p_first_name),
    nullif(trim(coalesce(p_last_name,'')),''),
    true,
    coalesce(p_is_demo,false)
  )
  returning id into v_child_id;

  insert into public.child_registrations(
    child_id,school_year,birth_date,school,grade,status,show_birthday_publicly,
    created_by,updated_by
  ) values (
    v_child_id,trim(p_school_year),p_birth_date,nullif(trim(coalesce(p_school,'')),''),
    nullif(trim(coalesce(p_grade,'')),''),'active',true,auth.uid(),auth.uid()
  );

  return v_child_id;
end;
$$;

revoke all on function public.create_student_profile_v2(text,text,date,text,text,text,boolean) from public, anon;
grant execute on function public.create_student_profile_v2(text,text,date,text,text,text,boolean) to authenticated;

create or replace function public.attendance_monthly_report(p_month_start date)
returns table(
  month_start date,
  month_end date,
  open_days bigint,
  days_with_sign_ins bigint,
  child_sign_ins bigint,
  unique_children bigint,
  community_sign_ins bigint,
  total_sign_ins bigint,
  avg_children_per_open_day numeric,
  avg_community_per_open_day numeric,
  good_moods bigint,
  okay_moods bigint,
  hard_day_moods bigint
)
language plpgsql
set search_path to ''
as $$
declare
  v_start date;
  v_end date;
begin
  if not public.current_user_is_active_staff() then
    raise exception 'Active staff access required';
  end if;

  v_start := date_trunc('month', coalesce(p_month_start, current_date))::date;
  v_end := (v_start + interval '1 month - 1 day')::date;

  return query
  with active_visits as (
    select av.*
    from public.attendance_visits av
    left join public.children c on c.id = av.child_id
    where av.status = 'active'
      and av.service_date between v_start and v_end
      and (
        av.participant_type <> 'child'
        or coalesce(c.is_demo,false) = false
      )
  ),
  visit_counts as (
    select
      count(distinct service_date)::bigint as days_with_sign_ins,
      count(*) filter (where participant_type = 'child')::bigint as child_sign_ins,
      count(distinct child_id) filter (where participant_type = 'child')::bigint as unique_children,
      count(*) filter (where participant_type <> 'child')::bigint as community_sign_ins,
      count(*)::bigint as total_sign_ins
    from active_visits
  ),
  open_count as (
    select count(*)::bigint as open_days
    from public.operating_days od
    where od.is_open
      and od.service_date between v_start and v_end
  ),
  mood_counts as (
    select
      count(*) filter (where aw.mood = 'good')::bigint as good_moods,
      count(*) filter (where aw.mood = 'okay')::bigint as okay_moods,
      count(*) filter (where aw.mood = 'hard_day')::bigint as hard_day_moods
    from public.attendance_wellbeing aw
    join active_visits av on av.id = aw.visit_id
  )
  select
    v_start,
    v_end,
    oc.open_days,
    vc.days_with_sign_ins,
    vc.child_sign_ins,
    vc.unique_children,
    vc.community_sign_ins,
    vc.total_sign_ins,
    case when oc.open_days > 0 then round(vc.child_sign_ins::numeric / oc.open_days, 2) else null end,
    case when oc.open_days > 0 then round(vc.community_sign_ins::numeric / oc.open_days, 2) else null end,
    mc.good_moods,
    mc.okay_moods,
    mc.hard_day_moods
  from visit_counts vc
  cross join open_count oc
  cross join mood_counts mc;
end;
$$;
;