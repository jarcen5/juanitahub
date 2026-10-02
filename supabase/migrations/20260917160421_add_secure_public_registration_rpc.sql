create or replace function public.public_registration_catalog()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'public_id', p.public_registration_id,
      'name', p.name,
      'program_type', p.program_type,
      'audience', p.audience,
      'season_label', p.season_label,
      'description', p.description,
      'location', p.location,
      'starts_on', p.starts_on,
      'ends_on', p.ends_on,
      'meeting_days', p.meeting_days,
      'capacity', p.capacity,
      'registration_intro', p.registration_intro,
      'registration_modes', coalesce((select jsonb_agg(o.registration_mode order by o.display_order, o.id) from public.program_registration_options o where o.program_id=p.id), jsonb_build_array(p.registration_mode))
    ) order by p.starts_on nulls last, p.name
  ), '[]'::jsonb)
  from public.programs p
  where p.registration_public
    and p.status = 'open'
    and (p.registration_opens_at is null or p.registration_opens_at <= now())
    and (p.registration_closes_at is null or p.registration_closes_at >= now());
$$;

create or replace function public.public_registration_program(p_public_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program public.programs%rowtype;
  v_modes jsonb;
  v_consents jsonb;
  v_active_count integer;
begin
  select * into v_program
  from public.programs
  where public_registration_id = p_public_id
    and registration_public
    and status = 'open'
    and (registration_opens_at is null or registration_opens_at <= now())
    and (registration_closes_at is null or registration_closes_at >= now());

  if not found then return null; end if;

  select coalesce(jsonb_agg(registration_mode order by display_order,id), jsonb_build_array(v_program.registration_mode))
  into v_modes
  from public.program_registration_options
  where program_id = v_program.id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'title', title,
      'body', body,
      'required', required,
      'applies_to_modes', applies_to_modes,
      'display_order', display_order
    ) order by display_order,id), '[]'::jsonb)
  into v_consents
  from public.program_registration_consents
  where program_id = v_program.id and active;

  select count(*)::integer into v_active_count
  from public.program_enrollments
  where program_id=v_program.id and status in ('pending','enrolled','waitlisted');

  return jsonb_build_object(
    'public_id', v_program.public_registration_id,
    'name', v_program.name,
    'program_type', v_program.program_type,
    'audience', v_program.audience,
    'season_label', v_program.season_label,
    'description', v_program.description,
    'registration_intro', v_program.registration_intro,
    'location', v_program.location,
    'starts_on', v_program.starts_on,
    'ends_on', v_program.ends_on,
    'meeting_days', v_program.meeting_days,
    'capacity', v_program.capacity,
    'active_count', v_active_count,
    'registration_modes', v_modes,
    'consents', v_consents
  );
end;
$$;

create or replace function public.public_registration_renewal_context(p_public_id uuid, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_program public.programs%rowtype;
  v_token public.registration_access_tokens%rowtype;
  v_hash text;
  v_contact jsonb;
  v_children jsonb;
begin
  if p_token is null or length(p_token) < 32 then return null; end if;

  select * into v_program
  from public.programs
  where public_registration_id=p_public_id
    and registration_public
    and status='open'
    and (registration_opens_at is null or registration_opens_at <= now())
    and (registration_closes_at is null or registration_closes_at >= now());
  if not found then return null; end if;

  v_hash := encode(digest(p_token,'sha256'),'hex');
  select * into v_token
  from public.registration_access_tokens
  where program_id=v_program.id and token_hash=v_hash and status='active' and expires_at>now();
  if not found then return null; end if;

  select jsonb_build_object(
    'name', hc.name,
    'relationship', hc.relationship,
    'email', hc.email,
    'phone', hc.phone,
    'other_phone', hc.other_phone,
    'address', hc.address,
    'preferred_contact', hc.preferred_contact
  ) into v_contact
  from public.household_contacts hc
  where hc.household_id=v_token.household_id and hc.active
  order by hc.is_primary desc, hc.id
  limit 1;

  select coalesce(jsonb_agg(child_obj order by child_obj->>'first_name', child_obj->>'last_name'),'[]'::jsonb)
  into v_children
  from (
    select jsonb_build_object(
      'existing_child_id', c.id,
      'first_name', c.first_name,
      'last_name', c.last_name,
      'birth_date', r.birth_date,
      'school', r.school,
      'grade', r.grade,
      'attendance_days', coalesce(to_jsonb(r.attendance_days),'[]'::jsonb),
      'attends_other_program', coalesce(r.attends_other_program,false),
      'other_program_arrival_notes', r.other_program_arrival_notes,
      'dismissal_plan', r.dismissal_plan,
      'dismissal_notes', r.dismissal_notes,
      'show_birthday_publicly', coalesce(r.show_birthday_publicly,false),
      'allergies', h.allergies,
      'medical_conditions', h.medical_conditions,
      'learning_support', h.learning_support,
      'behavioral_support', h.behavioral_support,
      'actions_to_take', h.actions_to_take,
      'important_care_notes', h.important_care_notes,
      'emergency', case when eg.id is null then null else jsonb_build_object('name',eg.name,'relationship',eg.relationship,'phone',eg.phone) end
    ) child_obj
    from public.household_children hc
    join public.children c on c.id=hc.child_id and c.active
    left join lateral (
      select cr.* from public.child_registrations cr where cr.child_id=c.id order by cr.registered_at desc, cr.id desc limit 1
    ) r on true
    left join public.child_health_info h on h.registration_id=r.id
    left join lateral (
      select cg.* from public.child_guardians cg where cg.registration_id=r.id and cg.is_emergency and not cg.is_primary order by cg.id limit 1
    ) eg on true
    where hc.household_id=v_token.household_id and hc.active
  ) q;

  return jsonb_build_object(
    'household_id', v_token.household_id,
    'household_display_name', (select display_name from public.households where id=v_token.household_id),
    'guardian', coalesce(v_contact,'{}'::jsonb),
    'children', v_children,
    'expires_at', v_token.expires_at
  );
end;
$$;

create or replace function public.submit_public_registration(p_public_id uuid, p_mode text, p_payload jsonb, p_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_program public.programs%rowtype;
  v_token public.registration_access_tokens%rowtype;
  v_token_hash text;
  v_household_id bigint;
  v_access_token_id uuid;
  v_submission_id uuid;
  v_submission_code text;
  v_guardian jsonb := coalesce(p_payload->'guardian','{}'::jsonb);
  v_adult jsonb := coalesce(p_payload->'adult','{}'::jsonb);
  v_children jsonb := coalesce(p_payload->'children','[]'::jsonb);
  v_consents jsonb;
  v_child jsonb;
  v_bad_child boolean := false;
  v_required_missing boolean := false;
  v_submitter_name text;
  v_submitter_email text;
  v_submitter_phone text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 100000 then
    raise exception 'Invalid registration payload';
  end if;

  select * into v_program
  from public.programs
  where public_registration_id=p_public_id
    and registration_public
    and status='open'
    and (registration_opens_at is null or registration_opens_at <= now())
    and (registration_closes_at is null or registration_closes_at >= now());
  if not found then raise exception 'Registration is not currently available'; end if;

  if not exists (
    select 1 from public.program_registration_options o
    where o.program_id=v_program.id and o.registration_mode=p_mode
  ) and v_program.registration_mode <> p_mode then
    raise exception 'That registration path is not enabled for this program';
  end if;

  if p_mode not in ('full','renewal','summer_short','permission_only','short_youth','adult_short') then
    raise exception 'Invalid registration path';
  end if;

  if p_mode in ('renewal','summer_short','permission_only') then
    if p_token is null or length(p_token)<32 then raise exception 'A valid returning-family link is required'; end if;
    v_token_hash := encode(digest(p_token,'sha256'),'hex');
    select * into v_token from public.registration_access_tokens
    where program_id=v_program.id and token_hash=v_token_hash and status='active' and expires_at>now()
    for update;
    if not found then raise exception 'This returning-family link is invalid or expired'; end if;
    v_household_id := v_token.household_id;
    v_access_token_id := v_token.id;

    if jsonb_typeof(v_children) <> 'array' or jsonb_array_length(v_children)=0 then raise exception 'Select at least one child'; end if;
    for v_child in select value from jsonb_array_elements(v_children) loop
      if coalesce((v_child->>'selected')::boolean,true) and (
        nullif(v_child->>'existing_child_id','') is null or not exists (
          select 1 from public.household_children hc where hc.household_id=v_household_id and hc.child_id=(v_child->>'existing_child_id')::bigint and hc.active
        )
      ) then v_bad_child := true; end if;
    end loop;
    if v_bad_child then raise exception 'One or more selected children are not available for this household'; end if;
  else
    if p_mode <> 'adult_short' then
      if jsonb_typeof(v_children) <> 'array' or jsonb_array_length(v_children)=0 then raise exception 'Add at least one child'; end if;
      for v_child in select value from jsonb_array_elements(v_children) loop
        if nullif(v_child->>'existing_child_id','') is not null then v_bad_child := true; end if;
        if nullif(btrim(v_child->>'first_name'),'') is null then raise exception 'Each child needs a first name'; end if;
      end loop;
      if v_bad_child then raise exception 'Existing child IDs require a returning-family link'; end if;
    end if;
  end if;

  if p_mode='adult_short' then
    if nullif(btrim(v_adult->>'first_name'),'') is null then raise exception 'First name is required'; end if;
    if nullif(btrim(v_adult->>'email'),'') is null and nullif(btrim(v_adult->>'phone'),'') is null then raise exception 'Email or phone is required'; end if;
    v_submitter_name := concat_ws(' ',nullif(btrim(v_adult->>'first_name'),''),nullif(btrim(v_adult->>'last_name'),''));
    v_submitter_email := nullif(btrim(v_adult->>'email'),'');
    v_submitter_phone := nullif(btrim(v_adult->>'phone'),'');
  else
    if nullif(btrim(v_guardian->>'name'),'') is null then raise exception 'Parent or guardian name is required'; end if;
    if nullif(btrim(v_guardian->>'email'),'') is null and nullif(btrim(v_guardian->>'phone'),'') is null then raise exception 'Parent or guardian email or phone is required'; end if;
    v_submitter_name := nullif(btrim(v_guardian->>'name'),'');
    v_submitter_email := nullif(btrim(v_guardian->>'email'),'');
    v_submitter_phone := nullif(btrim(v_guardian->>'phone'),'');
  end if;

  if nullif(btrim(p_payload->>'signature_name'),'') is null then raise exception 'Signature name is required'; end if;
  if nullif(p_payload->>'signature_date','') is null then raise exception 'Signature date is required'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'title', c.title,
      'body', c.body,
      'required', c.required,
      'agreed', coalesce((select (x->>'agreed')::boolean from jsonb_array_elements(coalesce(p_payload->'consents','[]'::jsonb)) x where nullif(x->>'id','')::bigint=c.id limit 1), false)
    ) order by c.display_order,c.id),'[]'::jsonb)
  into v_consents
  from public.program_registration_consents c
  where c.program_id=v_program.id and c.active and p_mode=any(c.applies_to_modes);

  select exists(
    select 1 from jsonb_array_elements(v_consents) x where coalesce((x->>'required')::boolean,false) and not coalesce((x->>'agreed')::boolean,false)
  ) into v_required_missing;
  if v_required_missing then raise exception 'All required permissions must be accepted'; end if;

  p_payload := (p_payload - 'consents') || jsonb_build_object('consents',v_consents);

  insert into public.registration_submissions(program_id,registration_mode,household_id,access_token_id,status,submitter_name,submitter_email,submitter_phone,payload)
  values (v_program.id,p_mode,v_household_id,v_access_token_id,'submitted',v_submitter_name,v_submitter_email,v_submitter_phone,p_payload)
  returning id,submission_code into v_submission_id,v_submission_code;

  if v_access_token_id is not null then
    update public.registration_access_tokens set status='used',used_at=now() where id=v_access_token_id;
  end if;

  return jsonb_build_object('submission_id',v_submission_id,'submission_code',v_submission_code,'status','submitted');
end;
$$;

revoke all on function public.public_registration_catalog() from public;
revoke all on function public.public_registration_program(uuid) from public;
revoke all on function public.public_registration_renewal_context(uuid,text) from public;
revoke all on function public.submit_public_registration(uuid,text,jsonb,text) from public;
grant execute on function public.public_registration_catalog() to anon, authenticated;
grant execute on function public.public_registration_program(uuid) to anon, authenticated;
grant execute on function public.public_registration_renewal_context(uuid,text) to anon, authenticated;
grant execute on function public.submit_public_registration(uuid,text,jsonb,text) to anon, authenticated;;