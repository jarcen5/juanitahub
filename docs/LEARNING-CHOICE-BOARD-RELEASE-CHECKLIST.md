# Juanita Hub Learning — Staff-Approved Choice Board

**Status:** Review branch only. Supabase migration and Student Learning Edge Function have NOT been deployed. No existing student or assignment records were modified.

## How it complements recurring assignments

- **Recurring assignments stay required and schedule-driven.** Their existing rows, `schedule_id`, `occurrence_date`, and Today/weekly progress remain unchanged.
- **Choice Board is optional.** Staff approve existing independent digital activities once in a persistent catalog. Authorized children get a small list of choices during the current week. **No weekly re-publishing is needed**; the board remains enabled until staff switch it off.
- **Avoid duplicates.** Student choices exclude anything assigned (including a recurring occurrence) for that same child and week. At selection, the server checks again inside an atomic database transaction.
- **Weekly allowance resets each Monday** (America/New_York). Recommended default is two choices; staff can set 0–3 or turn the board off for each child.
- **School grade versus learning level.** The board uses the child's registered grade unless staff set an individual learning-level override. It affects optional eligibility, not the child's school registration.
- **No mandatory-work inflation.** Student-chosen rows have `assignment_origin='student_choice'`, `is_optional=true`, and `student_choice_at`. Student My Week required progress, Learning staff weekly scorecards, and Smart Planner required-target logic exclude optional choices. Optional work remains visible in a dedicated **My Choices** section.

## Staff review and approval

New staff page `/learning/choice-board`:

1. Browse safe interactive activities from the existing Assignment Library. Only active, digital/either typing, quizzes, reading, and writing qualify. Old Juanita Quest world and experimental mini-games are excluded.
2. Choose a staff-approved list and publish it once. Staff may withdraw items for future choices without deleting a student's already selected or completed work.
3. Select each child. Default is **disabled** and **two optional picks weekly**; staff can choose a learning-level override and change weekly limit (0–3).
4. See an on-page preview of the student activity board. The published choices are filtered by level and this week's existing assigned/recurring work.

## Student workflow

Student logs in via the currently activated lab computer and birthday PIN, as before. My Week displays the required Today / School Homework / Later This Week schedule. If the staff-enabled Choice Board is available, the child can press **Add to My Week** on an approved activity. It moves to **My Choices**, where normal quiz/typing/reading/writing runners can record completion.

## Security model

- Staff settings and catalog are new RLS-protected tables. Default is disabled for each student, with active-staff-only read/write access.
- Student client NEVER writes the catalog, optional assignment table, or existing assignment rows directly.
- Student request passes through `student-learning` Edge Function using the **already validated device-bound student session**. It derives child ID from session, not user-provided child ID.
- `claim_learning_choice` is a privileged SQL RPC granted **only to service_role**, used by the Edge Function. It serializes claims for each child (FOR UPDATE), checks the registered level or staff override, current Monday–Sunday week, catalog authorization, maximum weekly count, active/digital interactive content, and any same-week recurring/manual/optional assignment.
- `assigned_by` points to the *actual staff member who approved the catalog item*. `assignment_origin` and `last_updated_source` distinguish the student's selection. No fake staff login is used.
- All old student assignments default to `assignment_origin='staff'` and `is_optional=false`.

## Preview and production order

1. Review PR #38 (Smart Planner), then this **stacked Choice Board PR**. Verify the combined branch builds on Vercel. Neither PR is yet merged.
2. In the preview, visit `/learning/choice-board`. The staff interface uses existing library data but disables all writes. Draft a catalog, enable a child, adjust level and limit, and inspect the child-style preview.
3. **After user explicitly approves production rollout**, apply migration `20261117165500_learning_choice_board.sql` using Supabase migrations. Verify schema, policies, SQL RPC permissions, and existing rows before proceeding.
4. Deploy updated `supabase/functions/student-learning/index.ts`, which adds `choice_board` to `load_week` and a `choose_choice` action.
5. Merge reviewed web changes in a controlled sequence. The staff UI can only save from the primary production hostname and after the backend tables are available.
6. Begin with **the Jordan Lee demo profile only**, staff-approve one or two activities and test selection, weekly cap, reruns, completion and history. Confirm real student My Week and daily recurring workflows remain unaffected.
7. Confirm rewards/goal calculations for optional completions with staff before enabling for all children. If optional completion should NOT count toward goal points or learning achievement bonuses, adjust the existing goal functions as a separate reviewed migration.

## Known preview limitations

- Vercel's successful Next.js build tests web compilation only, not Supabase database migration syntax, student authentication, or RPC execution.
- The preview hostname cannot write catalog settings or assignments and the live Edge Function does **not** yet deliver student choices. Use the staff page's simulated preview.
- SQL migration and Edge Function must be separately approved and applied to make the board functional for children.
- Juanita Quest mini-games remain paused in PR #36, and are not included in this feature.
