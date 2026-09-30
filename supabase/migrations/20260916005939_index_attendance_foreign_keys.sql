create index attendance_visits_recorded_by_idx on public.attendance_visits (recorded_by);
create index attendance_visits_voided_by_idx on public.attendance_visits (voided_by) where voided_by is not null;
create index attendance_wellbeing_recorded_by_idx on public.attendance_wellbeing (recorded_by);
create index operating_days_recorded_by_idx on public.operating_days (recorded_by);
create index attendance_audit_changed_by_idx on public.attendance_audit (changed_by) where changed_by is not null;;