
create or replace function public.refresh_learning_goals(p_child_id bigint)
returns setof public.learning_goals
language plpgsql
security invoker
set search_path=public
as $$
declare
  g public.learning_goals%rowtype;
  v_value numeric;
  v_count integer;
  v_min_accuracy numeric;
begin
  if current_user <> 'service_role' then
    if not public.current_user_is_active_staff() then
      raise exception 'Active staff access required';
    end if;
  end if;

  update public.learning_goals
  set status='expired', updated_at=now()
  where child_id=p_child_id and status='active' and end_date < current_date;

  for g in
    select * from public.learning_goals
    where child_id=p_child_id and status='active'
    order by end_date,id
  loop
    v_value := 0;
    v_count := 0;

    if g.goal_type='assignment_completions' then
      select count(*)::numeric into v_value
      from public.learning_student_assignments a
      where a.child_id=g.child_id
        and a.status='completed'
        and a.completed_at is not null
        and a.completed_at::date between g.start_date and g.end_date;

    elsif g.goal_type='reading_minutes' then
      select coalesce(sum(r.minutes),0)::numeric into v_value
      from public.learning_reading_logs r
      where r.child_id=g.child_id and r.read_on between g.start_date and g.end_date;

    elsif g.goal_type='writing_submissions' then
      select count(*)::numeric into v_value
      from public.learning_writing_submissions w
      where w.child_id=g.child_id
        and w.status in ('submitted','reviewed')
        and coalesce(w.submitted_at,w.updated_at)::date between g.start_date and g.end_date;

    elsif g.goal_type='quiz_consistency' then
      select count(distinct q.student_assignment_id)::integer into v_count
      from public.learning_quiz_attempts q
      where q.child_id=g.child_id
        and q.created_at::date between g.start_date and g.end_date
        and q.percent >= g.target_value;
      v_value := coalesce(v_count,0);

    elsif g.goal_type='typing_accuracy' then
      select count(distinct t.student_assignment_id)::integer into v_count
      from public.learning_typing_attempts t
      where t.child_id=g.child_id
        and t.created_at::date between g.start_date and g.end_date
        and t.accuracy >= g.target_value;
      v_value := coalesce(v_count,0);

    elsif g.goal_type='typing_wpm' then
      v_min_accuracy := coalesce(nullif(g.config->>'minimum_accuracy','')::numeric,85);
      select coalesce(max(t.wpm),0)::numeric into v_value
      from public.learning_typing_attempts t
      where t.child_id=g.child_id
        and t.created_at::date between g.start_date and g.end_date
        and t.accuracy >= v_min_accuracy;

    elsif g.goal_type='custom' then
      v_value := g.current_value;
      v_count := g.current_count;
    end if;

    update public.learning_goals
    set current_value=coalesce(v_value,0),
        current_count=case
          when g.goal_type in ('quiz_consistency','typing_accuracy','custom') then coalesce(v_count,0)
          else current_count
        end,
        status=case
          when g.goal_type in ('quiz_consistency','typing_accuracy','custom')
               and coalesce(v_count,0) >= g.target_count then 'reached'
          when g.goal_type not in ('quiz_consistency','typing_accuracy','custom')
               and coalesce(v_value,0) >= g.target_value then 'reached'
          else status
        end,
        reached_at=case
          when (
            (g.goal_type in ('quiz_consistency','typing_accuracy','custom') and coalesce(v_count,0) >= g.target_count)
            or
            (g.goal_type not in ('quiz_consistency','typing_accuracy','custom') and coalesce(v_value,0) >= g.target_value)
          ) then coalesce(reached_at,now())
          else reached_at
        end,
        updated_at=now()
    where id=g.id;
  end loop;

  return query
  select * from public.learning_goals
  where child_id=p_child_id
  order by
    case status when 'reached' then 0 when 'active' then 1 when 'approved' then 2 else 3 end,
    end_date,
    id desc;
end;
$$;

create or replace function public.create_learning_goal(
  p_child_id bigint,
  p_goal_type text,
  p_title text,
  p_description text,
  p_start_date date,
  p_end_date date,
  p_target_value numeric,
  p_target_count integer default 1,
  p_config jsonb default '{}'::jsonb
)
returns public.learning_goals
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_goal public.learning_goals;
begin
  if not public.current_user_is_active_staff() then raise exception 'Active staff access required'; end if;
  if p_goal_type not in ('assignment_completions','reading_minutes','writing_submissions','quiz_consistency','typing_accuracy','typing_wpm','custom') then
    raise exception 'Unsupported learning goal type';
  end if;
  if p_end_date < p_start_date then raise exception 'Goal end date must be on or after the start date'; end if;
  if p_target_value <= 0 then raise exception 'Goal target must be greater than zero'; end if;
  if coalesce(p_target_count,1) < 1 then raise exception 'Goal count must be at least one'; end if;

  insert into public.learning_goals(
    child_id,goal_type,title,description,start_date,end_date,target_value,target_count,
    reward_points,config,created_by
  ) values (
    p_child_id,p_goal_type,trim(p_title),nullif(trim(coalesce(p_description,'')),''),
    p_start_date,p_end_date,p_target_value,coalesce(p_target_count,1),1,
    coalesce(p_config,'{}'::jsonb),(select auth.uid())
  )
  returning * into v_goal;

  return v_goal;
end;
$$;

create or replace function public.increment_custom_learning_goal(p_goal_id bigint)
returns public.learning_goals
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_goal public.learning_goals;
begin
  if not public.current_user_is_active_staff() then raise exception 'Active staff access required'; end if;

  update public.learning_goals
  set current_count=current_count+1,
      current_value=current_count+1,
      status=case when current_count+1 >= target_count then 'reached' else status end,
      reached_at=case when current_count+1 >= target_count then coalesce(reached_at,now()) else reached_at end,
      updated_at=now()
  where id=p_goal_id and goal_type='custom' and status='active'
  returning * into v_goal;

  if v_goal.id is null then raise exception 'Custom goal is not active'; end if;
  return v_goal;
end;
$$;

create or replace function public.approve_learning_goal_bonus(p_goal_id bigint)
returns public.learning_goal_bonus_points
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_goal public.learning_goals;
  v_bonus public.learning_goal_bonus_points;
begin
  if not public.current_user_is_active_staff() then raise exception 'Active staff access required'; end if;

  select * into v_goal from public.learning_goals where id=p_goal_id for update;
  if v_goal.id is null then raise exception 'Goal not found'; end if;
  if v_goal.status <> 'reached' then raise exception 'This goal is not waiting for approval'; end if;

  update public.learning_goals
  set status='approved',approved_by=(select auth.uid()),approved_at=now(),updated_at=now()
  where id=p_goal_id
  returning * into v_goal;

  insert into public.learning_goal_bonus_points(goal_id,child_id,points,awarded_on,awarded_by,note)
  values (v_goal.id,v_goal.child_id,v_goal.reward_points,current_date,(select auth.uid()),'Learning Goal Bonus: '||v_goal.title)
  returning * into v_bonus;

  return v_bonus;
end;
$$;

create or replace function public.refresh_learning_achievements(p_child_id bigint)
returns setof public.learning_student_achievements
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_completed integer;
  v_writing integer;
  v_reading integer;
  v_best_accuracy numeric;
  v_best_wpm numeric;
  v_best_quiz numeric;
begin
  if current_user <> 'service_role' then
    if not public.current_user_is_active_staff() then
      raise exception 'Active staff access required';
    end if;
  end if;

  select count(*) into v_completed from public.learning_student_assignments
  where child_id=p_child_id and status='completed';

  select count(*) into v_writing from public.learning_writing_submissions
  where child_id=p_child_id and status in ('submitted','reviewed');

  select coalesce(sum(minutes),0) into v_reading from public.learning_reading_logs
  where child_id=p_child_id;

  select coalesce(max(accuracy),0),coalesce(max(wpm) filter (where accuracy>=85),0)
    into v_best_accuracy,v_best_wpm
  from public.learning_typing_attempts where child_id=p_child_id;

  select coalesce(max(percent),0) into v_best_quiz
  from public.learning_quiz_attempts where child_id=p_child_id;

  if v_completed>=1 then
    insert into public.learning_student_achievements(child_id,achievement_key,title,description,icon,metadata)
    values(p_child_id,'first_assignment','First Assignment','Completed a first Juanita Hub learning assignment.','🌟',jsonb_build_object('completed',v_completed))
    on conflict(child_id,achievement_key) do nothing;
  end if;
  if v_completed>=5 then
    insert into public.learning_student_achievements(child_id,achievement_key,title,description,icon,metadata)
    values(p_child_id,'five_assignments','Five Finished','Completed five learning assignments.','✅',jsonb_build_object('completed',v_completed))
    on conflict(child_id,achievement_key) do nothing;
  end if;
  if v_completed>=10 then
    insert into public.learning_student_achievements(child_id,achievement_key,title,description,icon,metadata)
    values(p_child_id,'ten_assignments','Ten Strong','Completed ten learning assignments.','🏅',jsonb_build_object('completed',v_completed))
    on conflict(child_id,achievement_key) do nothing;
  end if;
  if v_writing>=1 then
    insert into public.learning_student_achievements(child_id,achievement_key,title,description,icon,metadata)
    values(p_child_id,'first_writing','Writer at Work','Submitted a first writing assignment.','✍️',jsonb_build_object('submissions',v_writing))
    on conflict(child_id,achievement_key) do nothing;
  end if;
  if v_reading>=60 then
    insert into public.learning_student_achievements(child_id,achievement_key,title,description,icon,metadata)
    values(p_child_id,'reading_60','Reading Hour','Logged 60 minutes of reading.','📖',jsonb_build_object('minutes',v_reading))
    on conflict(child_id,achievement_key) do nothing;
  end if;
  if v_reading>=120 then
    insert into public.learning_student_achievements(child_id,achievement_key,title,description,icon,metadata)
    values(p_child_id,'reading_120','Reading Explorer','Logged 120 minutes of reading.','📚',jsonb_build_object('minutes',v_reading))
    on conflict(child_id,achievement_key) do nothing;
  end if;
  if v_reading>=300 then
    insert into public.learning_student_achievements(child_id,achievement_key,title,description,icon,metadata)
    values(p_child_id,'reading_300','Reading Champion','Logged 300 minutes of reading.','🏆',jsonb_build_object('minutes',v_reading))
    on conflict(child_id,achievement_key) do nothing;
  end if;
  if v_best_accuracy>=90 then
    insert into public.learning_student_achievements(child_id,achievement_key,title,description,icon,metadata)
    values(p_child_id,'typing_accuracy_90','Accurate Typist','Reached at least 90% typing accuracy.','⌨️',jsonb_build_object('best_accuracy',v_best_accuracy))
    on conflict(child_id,achievement_key) do nothing;
  end if;
  if v_best_wpm>=20 then
    insert into public.learning_student_achievements(child_id,achievement_key,title,description,icon,metadata)
    values(p_child_id,'typing_20_wpm','Typing Momentum','Reached 20 WPM while maintaining at least 85% accuracy.','🚀',jsonb_build_object('best_wpm',v_best_wpm))
    on conflict(child_id,achievement_key) do nothing;
  end if;
  if v_best_quiz>=90 then
    insert into public.learning_student_achievements(child_id,achievement_key,title,description,icon,metadata)
    values(p_child_id,'quiz_90','Quiz Goal Reached','Scored at least 90% on a quiz.','🧠',jsonb_build_object('best_percent',v_best_quiz))
    on conflict(child_id,achievement_key) do nothing;
  end if;

  return query
  select * from public.learning_student_achievements
  where child_id=p_child_id
  order by unlocked_at desc,id desc;
end;
$$;

create or replace function public.learning_goal_suggestions(p_child_id bigint)
returns jsonb
language plpgsql
stable
security invoker
set search_path=public
as $$
declare
  v_completed integer := 0;
  v_reading integer := 0;
  v_writing integer := 0;
  v_quiz numeric;
  v_accuracy numeric;
  v_wpm numeric;
  v_assignment_target integer;
  v_reading_target integer;
  v_writing_target integer;
  v_quiz_target integer;
  v_accuracy_target integer;
  v_wpm_target integer;
begin
  if not public.current_user_is_active_staff() then raise exception 'Active staff access required'; end if;

  select count(*) into v_completed
  from public.learning_student_assignments
  where child_id=p_child_id and status='completed'
    and completed_at >= now()-interval '30 days';

  select coalesce(sum(minutes),0) into v_reading
  from public.learning_reading_logs
  where child_id=p_child_id and read_on >= current_date-29;

  select count(*) into v_writing
  from public.learning_writing_submissions
  where child_id=p_child_id and status in ('submitted','reviewed')
    and coalesce(submitted_at,updated_at)>=now()-interval '30 days';

  select avg(percent) into v_quiz from (
    select percent from public.learning_quiz_attempts
    where child_id=p_child_id order by created_at desc limit 5
  ) q;

  select avg(accuracy),avg(wpm) filter (where activity_mode in ('passage','letter_drill'))
    into v_accuracy,v_wpm
  from (
    select accuracy,wpm,activity_mode from public.learning_typing_attempts
    where child_id=p_child_id order by created_at desc limit 5
  ) t;

  v_assignment_target := greatest(3,least(8,v_completed+1));
  v_reading_target := least(360,greatest(60,(ceil(greatest(v_reading,45)*1.15/15.0)*15)::integer));
  v_writing_target := greatest(2,least(4,v_writing+1));
  v_quiz_target := least(95,greatest(80,ceil(coalesce(v_quiz,75)+5)::integer));
  v_accuracy_target := least(98,greatest(88,ceil(coalesce(v_accuracy,84)+4)::integer));
  v_wpm_target := greatest(12,ceil(coalesce(v_wpm,10)+greatest(2,coalesce(v_wpm,10)*0.10))::integer);

  return jsonb_build_array(
    jsonb_build_object(
      'goal_type','assignment_completions','title','Finish '||v_assignment_target||' learning activities',
      'description','Complete '||v_assignment_target||' assigned learning activities during the goal period.',
      'target_value',v_assignment_target,'target_count',1,'days',30,
      'reason',case when v_completed>0 then 'A small step above the '||v_completed||' completed in the last 30 days.' else 'A steady first completion goal.' end
    ),
    jsonb_build_object(
      'goal_type','reading_minutes','title','Read for '||v_reading_target||' minutes',
      'description','Build a consistent reading habit across the next 30 days.',
      'target_value',v_reading_target,'target_count',1,'days',30,
      'reason',case when v_reading>0 then 'Based on '||v_reading||' minutes logged in the last 30 days.' else 'A reachable first monthly reading target.' end
    ),
    jsonb_build_object(
      'goal_type','writing_submissions','title','Submit '||v_writing_target||' writing assignments',
      'description','Finish and submit '||v_writing_target||' writing activities during the goal period.',
      'target_value',v_writing_target,'target_count',1,'days',30,
      'reason',case when v_writing>0 then 'One step beyond recent writing activity.' else 'A manageable starting writing goal.' end
    ),
    jsonb_build_object(
      'goal_type','quiz_consistency','title','Score '||v_quiz_target||'%+ on 3 quizzes',
      'description','Reach at least '||v_quiz_target||'% on three different quiz assignments.',
      'target_value',v_quiz_target,'target_count',3,'days',45,
      'reason',case when v_quiz is not null then 'Recent quiz average is about '||round(v_quiz,0)||'%.' else 'Starts with a solid but reachable accuracy target.' end
    ),
    jsonb_build_object(
      'goal_type','typing_accuracy','title','Reach '||v_accuracy_target||'%+ accuracy 3 times',
      'description','Reach at least '||v_accuracy_target||'% accuracy on three different typing assignments.',
      'target_value',v_accuracy_target,'target_count',3,'days',45,
      'reason',case when v_accuracy is not null then 'Recent typing accuracy averages about '||round(v_accuracy,0)||'%.' else 'A strong first accuracy goal.' end
    ),
    jsonb_build_object(
      'goal_type','typing_wpm','title','Reach '||v_wpm_target||' WPM with good accuracy',
      'description','Reach '||v_wpm_target||' WPM while keeping at least 85% accuracy.',
      'target_value',v_wpm_target,'target_count',1,'days',45,
      'config',jsonb_build_object('minimum_accuracy',85),
      'reason',case when v_wpm is not null then 'Recent typing speed averages about '||round(v_wpm,1)||' WPM.' else 'A starter speed goal with an accuracy safeguard.' end
    )
  );
end;
$$;

revoke all on function public.refresh_learning_goals(bigint) from public,anon;
grant execute on function public.refresh_learning_goals(bigint) to authenticated,service_role;

revoke all on function public.create_learning_goal(bigint,text,text,text,date,date,numeric,integer,jsonb) from public,anon;
grant execute on function public.create_learning_goal(bigint,text,text,text,date,date,numeric,integer,jsonb) to authenticated;

revoke all on function public.increment_custom_learning_goal(bigint) from public,anon;
grant execute on function public.increment_custom_learning_goal(bigint) to authenticated;

revoke all on function public.approve_learning_goal_bonus(bigint) from public,anon;
grant execute on function public.approve_learning_goal_bonus(bigint) to authenticated;

revoke all on function public.refresh_learning_achievements(bigint) from public,anon;
grant execute on function public.refresh_learning_achievements(bigint) to authenticated,service_role;

revoke all on function public.learning_goal_suggestions(bigint) from public,anon;
grant execute on function public.learning_goal_suggestions(bigint) to authenticated;

grant select on public.learning_reading_logs to service_role;
;