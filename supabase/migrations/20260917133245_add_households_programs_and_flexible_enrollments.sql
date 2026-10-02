create table public.households (
  id bigint generated always as identity primary key,
  display_name text not null check (length(trim(display_name)) > 0),
  status text not null default 'active' check (status in ('active','inactive','archived')),
  last_program_activity_on date,
  archived_at timestamptz,
  purge_after date,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_children (
  household_id bigint not null references public.households(id) on delete cascade,
  child_id bigint not null references public.children(id) on delete cascade,
  is_primary boolean not null default false,
  active boolean not null default true,
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  primary key (household_id, child_id)
);

create unique index household_children_one_primary_idx
  on public.household_children(child_id)
  where active and is_primary;
create index household_children_child_idx on public.household_children(child_id);

create table public.household_contacts (
  id bigint generated always as identity primary key,
  household_id bigint not null references public.households(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  relationship text,
  email text,
  phone text,
  other_phone text,
  address text,
  preferred_contact text check (preferred_contact is null or preferred_contact in ('phone','text','email','whatsapp','other')),
  is_primary boolean not null default false,
  active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index household_contacts_one_primary_idx
  on public.household_contacts(household_id)
  where active and is_primary;
create index household_contacts_household_idx on public.household_contacts(household_id);

create table public.adult_participants (
  id bigint generated always as identity primary key,
  first_name text not null check (length(trim(first_name)) > 0),
  last_name text,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  archived_at timestamptz,
  purge_after date,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.adult_participant_contacts (
  participant_id bigint primary key references public.adult_participants(id) on delete cascade,
  email text,
  phone text,
  other_phone text,
  address text,
  preferred_contact text check (preferred_contact is null or preferred_contact in ('phone','text','email','whatsapp','other')),
  emergency_contact_name text,
  emergency_contact_relationship text,
  emergency_contact_phone text,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.programs (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) > 0),
  program_type text not null check (program_type in ('afterschool','summer','club','class','workshop','special','other')),
  audience text not null check (audience in ('youth','adult','family','mixed')),
  registration_mode text not null check (registration_mode in ('full','renewal','summer_short','permission_only','short_youth','adult_short')),
  season_label text,
  description text,
  location text,
  starts_on date,
  ends_on date,
  meeting_days text[] not null default '{}',
  start_time time,
  end_time time,
  capacity integer check (capacity is null or capacity > 0),
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  status text not null default 'draft' check (status in ('draft','open','closed','completed','archived')),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on),
  check (registration_closes_at is null or registration_opens_at is null or registration_closes_at >= registration_opens_at)
);

create index programs_status_dates_idx on public.programs(status, starts_on, ends_on);

create table public.program_enrollments (
  id bigint generated always as identity primary key,
  program_id bigint not null references public.programs(id) on delete cascade,
  household_id bigint references public.households(id) on delete set null,
  child_id bigint references public.children(id) on delete restrict,
  adult_participant_id bigint references public.adult_participants(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','enrolled','waitlisted','withdrawn','completed','declined')),
  source text not null default 'staff' check (source in ('staff','parent','import')),
  enrolled_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(child_id, adult_participant_id) = 1)
);

create unique index program_enrollments_child_unique_idx
  on public.program_enrollments(program_id, child_id)
  where child_id is not null;
create unique index program_enrollments_adult_unique_idx
  on public.program_enrollments(program_id, adult_participant_id)
  where adult_participant_id is not null;
create index program_enrollments_program_status_idx on public.program_enrollments(program_id, status);
create index program_enrollments_household_idx on public.program_enrollments(household_id) where household_id is not null;
create index program_enrollments_child_idx on public.program_enrollments(child_id) where child_id is not null;
create index program_enrollments_adult_idx on public.program_enrollments(adult_participant_id) where adult_participant_id is not null;

create or replace function public.set_center_record_updated_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

revoke all on function public.set_center_record_updated_fields() from public, anon, authenticated;

create trigger households_set_updated before update on public.households
for each row execute function public.set_center_record_updated_fields();
create trigger household_contacts_set_updated before update on public.household_contacts
for each row execute function public.set_center_record_updated_fields();
create trigger adult_participants_set_updated before update on public.adult_participants
for each row execute function public.set_center_record_updated_fields();
create trigger adult_participant_contacts_set_updated before update on public.adult_participant_contacts
for each row execute function public.set_center_record_updated_fields();
create trigger programs_set_updated before update on public.programs
for each row execute function public.set_center_record_updated_fields();
create trigger program_enrollments_set_updated before update on public.program_enrollments
for each row execute function public.set_center_record_updated_fields();

alter table public.households enable row level security;
alter table public.household_children enable row level security;
alter table public.household_contacts enable row level security;
alter table public.adult_participants enable row level security;
alter table public.adult_participant_contacts enable row level security;
alter table public.programs enable row level security;
alter table public.program_enrollments enable row level security;

create policy "active staff can view households" on public.households
for select to authenticated using ((select public.current_user_is_active_staff()));
create policy "admins can insert households" on public.households
for insert to authenticated with check ((select public.current_user_is_admin()));
create policy "admins can update households" on public.households
for update to authenticated using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));
create policy "admins can delete households" on public.households
for delete to authenticated using ((select public.current_user_is_admin()));

create policy "active staff can view household child links" on public.household_children
for select to authenticated using ((select public.current_user_is_active_staff()));
create policy "admins can insert household child links" on public.household_children
for insert to authenticated with check ((select public.current_user_is_admin()));
create policy "admins can update household child links" on public.household_children
for update to authenticated using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));
create policy "admins can delete household child links" on public.household_children
for delete to authenticated using ((select public.current_user_is_admin()));

create policy "admins can view household contacts" on public.household_contacts
for select to authenticated using ((select public.current_user_is_admin()));
create policy "admins can insert household contacts" on public.household_contacts
for insert to authenticated with check ((select public.current_user_is_admin()));
create policy "admins can update household contacts" on public.household_contacts
for update to authenticated using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));
create policy "admins can delete household contacts" on public.household_contacts
for delete to authenticated using ((select public.current_user_is_admin()));

create policy "active staff can view adult participants" on public.adult_participants
for select to authenticated using ((select public.current_user_is_active_staff()));
create policy "admins can insert adult participants" on public.adult_participants
for insert to authenticated with check ((select public.current_user_is_admin()));
create policy "admins can update adult participants" on public.adult_participants
for update to authenticated using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));
create policy "admins can delete adult participants" on public.adult_participants
for delete to authenticated using ((select public.current_user_is_admin()));

create policy "admins can view adult participant contacts" on public.adult_participant_contacts
for select to authenticated using ((select public.current_user_is_admin()));
create policy "admins can insert adult participant contacts" on public.adult_participant_contacts
for insert to authenticated with check ((select public.current_user_is_admin()));
create policy "admins can update adult participant contacts" on public.adult_participant_contacts
for update to authenticated using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));
create policy "admins can delete adult participant contacts" on public.adult_participant_contacts
for delete to authenticated using ((select public.current_user_is_admin()));

create policy "active staff can view programs" on public.programs
for select to authenticated using ((select public.current_user_is_active_staff()));
create policy "admins can insert programs" on public.programs
for insert to authenticated with check ((select public.current_user_is_admin()));
create policy "admins can update programs" on public.programs
for update to authenticated using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));
create policy "admins can delete programs" on public.programs
for delete to authenticated using ((select public.current_user_is_admin()));

create policy "active staff can view program enrollments" on public.program_enrollments
for select to authenticated using ((select public.current_user_is_active_staff()));
create policy "admins can insert program enrollments" on public.program_enrollments
for insert to authenticated with check ((select public.current_user_is_admin()));
create policy "admins can update program enrollments" on public.program_enrollments
for update to authenticated using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));
create policy "admins can delete program enrollments" on public.program_enrollments
for delete to authenticated using ((select public.current_user_is_admin()));

revoke all on public.households, public.household_children, public.household_contacts, public.adult_participants, public.adult_participant_contacts, public.programs, public.program_enrollments from anon;
grant select, insert, update, delete on public.households, public.household_children, public.household_contacts, public.adult_participants, public.adult_participant_contacts, public.programs, public.program_enrollments to authenticated;
grant usage, select on sequence public.households_id_seq, public.household_contacts_id_seq, public.adult_participants_id_seq, public.programs_id_seq, public.program_enrollments_id_seq to authenticated;;