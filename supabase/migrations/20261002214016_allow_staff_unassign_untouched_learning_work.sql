drop policy if exists "active staff can unassign untouched learning work"
on public.learning_student_assignments;

create policy "active staff can unassign untouched learning work"
on public.learning_student_assignments
for delete
to authenticated
using (
  (select public.current_user_is_active_staff())
  and status = 'assigned'
  and completed_at is null
  and score is null
  and max_score is null
  and minutes_spent is null
  and staff_note is null
  and not exists (
    select 1
    from public.learning_typing_attempts t
    where t.student_assignment_id = learning_student_assignments.id
  )
  and not exists (
    select 1
    from public.learning_quiz_attempts q
    where q.student_assignment_id = learning_student_assignments.id
  )
  and not exists (
    select 1
    from public.learning_writing_submissions w
    where w.student_assignment_id = learning_student_assignments.id
  )
  and not exists (
    select 1
    from public.learning_reading_attempts r
    where r.student_assignment_id = learning_student_assignments.id
  )
);
