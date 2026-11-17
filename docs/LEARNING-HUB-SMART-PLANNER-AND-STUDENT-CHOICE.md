# Learning Hub redesign — less manual assignment work

## Motivation

Staff currently assign supplemental work one child or grade at a time. The Assignment Library contains active, grade-labeled activities and Learning already stores assignment history and completion status. The new Weekly Planner uses those existing records.

## Phase 1 — Smart Weekly Planner (this PR)

- New staff route `/learning/planner`, reachable from Learning navigation and This Week's "No work assigned" card.
- Use an adjustable weekly **target of 1–5 total activities per child**. School homework and existing recurring practice count toward it.
- Select grade (or temporary individual learning level), recent history, a subject focus and desired difficulty.
- Recommend new work that matches learning level and has not been assigned recently; balance subjects before repeating.
- Preview suggestions for all included students, uncheck any unsuitable activity, set optional due date, and explicitly approve the batch.
- Exclude demos by default; optional checkbox for the Jordan Lee test profile.
- Avoid duplicate assignments for a student and week. Database unique indexes provide final enforcement.
- **Preview host disables all writes**; production builds permit a staff-confirmed batch save only.
- Suggestions are deterministic and explainable—not an AI-generated assessment or claim of educational mastery.

### Safety and ergonomics
- Never overwrite, delete, reassign, or rescore existing Learning work.
- No background job: the planner makes suggestions when requested; staff remain responsible for assigning them.
- Learning level overrides in the planner are temporary **and not persisted**. Future shared per-student settings should be approved first.
- Avoid assigning the old multi-station Juanita Quest world as automatic independent practice.
- Default to digital interactive practice, standard/support difficulty; staff can deliberately select challenge activities.

## Phase 2 — Child choice board (design, **not implemented yet**)

The user wants children to pick supplemental practice without waiting for a staff member. This requires **new secure student-choice rules**, not a client-side database insert.

1. Staff curate an allowlist of suitable active, self-contained, digital assignments, including independently assignable Juanita Quest mini-games after their own review.
2. Students view a short "Pick a Game" or "Choose Your Next Activity" list in My Week with pictures, subject, learning level, and estimated time.
3. Students may choose **up to a small weekly quota**, with a one-tap confirmation. The choice is restricted to their own authenticated Student Learning session and must not expose any other child's work.
4. The existing `learning_student_assignments.assigned_by` is a required **staff UUID**. Do not falsify this field. A future migration must add a proper choice-origin/approval field and a safe constraint or separate student-choice table before accepting student claims.
5. Implement a server-side Student Learning action using the current validated session and device, rechecking child, grade/approved learning level, active content, opt-in, quota, time window and duplicate status in one authorized, atomic operation. A client cannot bypass these checks.
6. Mark choice assignments as **optional** so unfinished choices do not inflate mandatory staff workload, rewards, or completion rates.
7. Staff can see what children picked and override inappropriate choices, without deleting completed work or harming audit trails.

### Suggested student UI

`My Week` → `Today / School Homework / Later This Week` → `Pick Something New` (3–5 friendly choices, replayable mini-games).

### Outstanding design decisions for staff review

- Should student choice be 1 optional activity/day or 2–3/week?
- Should it use registered school grade or a staff-set learning level for each subject?
- Should staff approve some choices before they appear, or automatically curate a trusted catalog?
- How should optional independent activity results affect Rewards points and completion reports?

No schema changes, Edge Function changes, cron jobs or student-initiated writes are included in Phase 1.
