grant update on public.attendance_wellbeing to authenticated;

create policy "active staff can correct attendance wellbeing"
on public.attendance_wellbeing for update to authenticated
using ((select public.current_user_is_active_staff()))
with check ((select public.current_user_is_active_staff()));

create or replace function public.audit_attendance_wellbeing_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
begin
  v_reason := nullif(current_setting('app.attendance_correction_reason', true), '');

  insert into public.attendance_audit (visit_id, action, old_record, new_record, changed_by)
  values (
    new.visit_id,
    'mood_updated',
    jsonb_build_object('wellbeing', to_jsonb(old), 'reason', v_reason),
    jsonb_build_object('wellbeing', to_jsonb(new), 'reason', v_reason),
    auth.uid()
  );

  return new;
end;
$$;

revoke execute on function public.audit_attendance_wellbeing_changes() from public, anon, authenticated;

create trigger attendance_wellbeing_audit_trigger
after update on public.attendance_wellbeing
for each row execute function public.audit_attendance_wellbeing_changes();

create or replace function public.correct_child_mood(
  p_visit_id bigint,
  p_mood text,
  p_reason text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_mood text;
begin
  if not public.current_user_is_active_staff() then
    raise exception 'Active staff access required';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'A correction reason is required';
  end if;

  v_mood := case p_mood
    when 'happy' then 'good'
    when 'meh' then 'okay'
    when 'sad' then 'hard_day'
    when 'good' then 'good'
    when 'okay' then 'okay'
    when 'hard_day' then 'hard_day'
    else null
  end;

  if v_mood is null then
    raise exception 'Invalid mood selection';
  end if;

  perform set_config('app.attendance_correction_reason', btrim(p_reason), true);

  update public.attendance_wellbeing
  set mood = v_mood,
      updated_at = now()
  where visit_id = p_visit_id;

  if not found then
    raise exception 'Mood record could not be found';
  end if;
end;
$$;

revoke execute on function public.correct_child_mood(bigint, text, text) from public, anon;
grant execute on function public.correct_child_mood(bigint, text, text) to authenticated;;