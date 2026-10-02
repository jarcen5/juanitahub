
create or replace function public.create_student_profile(
  p_first_name text,
  p_last_name text,
  p_birth_date date,
  p_school text,
  p_grade text,
  p_school_year text
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

  insert into public.children(first_name,last_name,active)
  values (trim(p_first_name), nullif(trim(coalesce(p_last_name,'')),''), true)
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
;