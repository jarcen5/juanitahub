alter table public.staff_profiles
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null;

update public.staff_profiles
set approved_at = coalesce(approved_at, created_at),
    approved_by = coalesce(approved_by, user_id)
where active and approved_at is null;;