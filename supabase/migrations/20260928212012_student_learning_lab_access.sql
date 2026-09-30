
create table if not exists public.learning_student_access (
  child_id bigint primary key references public.children(id) on delete cascade,
  enabled boolean not null default true,
  failed_attempts integer not null default 0 check (failed_attempts >= 0 and failed_attempts <= 20),
  locked_until timestamptz,
  last_login_at timestamptz,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.learning_student_access (child_id, enabled)
select id, true from public.children
on conflict (child_id) do nothing;

grant select, insert, update on public.learning_student_access to authenticated;
alter table public.learning_student_access enable row level security;

drop policy if exists "admins can view student learning access" on public.learning_student_access;
create policy "admins can view student learning access"
on public.learning_student_access for select to authenticated
using ((select public.current_user_is_admin()));

drop policy if exists "admins can add student learning access" on public.learning_student_access;
create policy "admins can add student learning access"
on public.learning_student_access for insert to authenticated
with check (
  (select public.current_user_is_admin())
  and (updated_by is null or updated_by = (select auth.uid()))
);

drop policy if exists "admins can update student learning access" on public.learning_student_access;
create policy "admins can update student learning access"
on public.learning_student_access for update to authenticated
using ((select public.current_user_is_admin()))
with check (
  (select public.current_user_is_admin())
  and (updated_by is null or updated_by = (select auth.uid()))
);

create table if not exists public.learning_lab_devices (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  label text,
  enabled boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table public.learning_lab_devices enable row level security;
revoke all on public.learning_lab_devices from anon, authenticated;

create table if not exists public.learning_student_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  child_id bigint not null references public.children(id) on delete cascade,
  device_id uuid not null references public.learning_lab_devices(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists learning_student_sessions_child_idx
  on public.learning_student_sessions(child_id, expires_at desc);
create index if not exists learning_student_sessions_expiry_idx
  on public.learning_student_sessions(expires_at);

alter table public.learning_student_sessions enable row level security;
revoke all on public.learning_student_sessions from anon, authenticated;

alter table public.learning_student_assignments
  alter column updated_by drop not null;
alter table public.learning_student_assignments
  add column if not exists last_updated_source text not null default 'staff'
  check (last_updated_source in ('staff','student'));

alter table public.learning_typing_attempts
  alter column completed_by drop not null;
alter table public.learning_typing_attempts
  add column if not exists completion_source text not null default 'staff'
  check (completion_source in ('staff','student'));

alter table public.learning_quiz_attempts
  alter column completed_by drop not null;
alter table public.learning_quiz_attempts
  add column if not exists completion_source text not null default 'staff'
  check (completion_source in ('staff','student'));

alter table public.learning_reading_attempts
  alter column completed_by drop not null;
alter table public.learning_reading_attempts
  add column if not exists completion_source text not null default 'staff'
  check (completion_source in ('staff','student'));

alter table public.learning_writing_submissions
  alter column updated_by drop not null;
alter table public.learning_writing_submissions
  add column if not exists last_updated_source text not null default 'staff'
  check (last_updated_source in ('staff','student'));

alter table public.learning_writing_revisions
  alter column saved_by drop not null;
alter table public.learning_writing_revisions
  add column if not exists save_source text not null default 'staff'
  check (save_source in ('staff','student'));
;