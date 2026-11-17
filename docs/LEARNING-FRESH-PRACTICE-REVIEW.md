# Fresh Practice Pack + Rotating Quiz Banks — Review and release checklist

**Review branch only**. No new live assignments, migrations, quiz attempts, or student scores have been written as part of this development phase. The library installer is disabled on preview hostnames.

## Content inventory

The initial pack adds **40 original digital activities** without deleting or modifying existing assignments.

| Learning level | Rotating quizzes | Guided writing prompts |
|---|---:|---:|
| Kindergarten | 8 | 1 |
| Grade 1 | 6 | 1 |
| Grade 2 | 6 | 1 |
| Grade 3 | 3 | 1 |
| Grade 4 | 2 | 1 |
| Grade 5 | 2 | 1 |
| Grade 6 | 3 | 1 |
| Grade 7 | 2 | 1 |
| **Total** | **32** | **8** |

There are **588 authored quiz-bank question records** in the pack; the rotating quizzes present **six** of their 15–20 questions per attempt. The activities cover picture counting, number comparison, early addition/subtraction, beginning sounds, rhymes, CVC vowels, longer vowel patterns, time and place value, short original reading passages, punctuation and grammar, multiplication and division, fractions, decimals, rates, integers, evidence and argument, and guided writing.

Every quiz bank is checked for unique question IDs, unique passage+prompt combinations, correct answers present among choices, and at least three extra questions beyond the number presented. The pack is fully inactive until a **staff administrator explicitly installs it after approval**.

## Question rotation and scoring

- Existing ordinary quizzes are **unchanged** by default.
- For a quiz with `activity_config.rotate_questions=true` and valid `questions_per_attempt`, the runner selects a stable shuffled sample of six questions. It also shuffles answer-choice order so the correct option does not always appear first.
- A new sample is selected on **Try again** and for different student-assignment IDs. Students can press **Hear the question** to listen to questions and choices using browser text-to-speech when supported.
- The student-learning Edge Function (not yet deployed) validates that exactly six distinct known question IDs were submitted; it **recalculates correctness from the server's saved bank** and saves a six-question attempt instead of counting unseen bank questions as wrong.
- Staff can enable rotation on custom quizzes in Quiz Builder, specify sample size, and edit the bank without silently losing rotation settings.
- **Practice variety reduces memorization, but is not exam-grade anti-cheating**: currently the full bank exists in the client-accessible assignment configuration, and the backend verifies a valid subset rather than a server-issued hidden question set. Any future high-stakes assessment needs protected server-delivered question sets and stronger attempt tracking.

## Coverage monitor

- New panel in **Learning → Assignment Library** shows active independent digital assignments for each level K–7 by subject, support difficulty, and count of rotating quizzes.
- "Needs more variety" is a heuristic: fewer than 16 interactive activities or fewer than 5 support activities. A higher total does not guarantee skill coverage or mastery.
- Staff may filter and preview the **40 original drafts** before publishing them, and admins can install missing titles idempotently only on the approved production hostname with explicit confirmation.
- Kindergarten is now an option in Smart Weekly Planner's **temporary learning-level override**, so children can get appropriately foundational work without changing their registered school grade.
- The Student Choice Board (still unreleased) prefers activities not assigned recently and rotates the visible dozen choices weekly, so newly expanded catalogs don't always show the same titles first. It still excludes a child’s current-week recurring and manual assignments.

## Manual review checklist before any release

1. On the preview, open **Learning → Assignment Library**, find the coverage table and filter the new pack by K, 1, 2, and older levels.
2. Use **Test** on picture-counting, beginning sounds, short-reading and older math quizzes; ensure the right answer is in each question's choices and that reading difficulty is appropriate. **Do not publish without a human content review**.
3. For a rotating quiz, verify six questions out of the larger bank, shuffled choices, correct scoring, **Try again** generating another subset, and optional read-aloud.
4. Test at least one existing, non-rotating quiz; it should still show and score its original complete question list.
5. In Quiz Builder, enable rotation on a custom quiz; verify invalid bank size, duplicate IDs/prompts and duplicate answer choices are rejected. Edit and reopen an existing rotating template, confirming metadata persists.
6. In Smart Weekly Planner, test a temporarily selected **K** learning level for a higher-grade student; verify suggestions reflect K content only once installed and that recurring/week targets remain unchanged.
7. In the draft Choice Board, check visual filtering for each subject and grade. Student selections are still not enabled while the Choice Board migration and Edge Function are undeployed.
8. After separate deployment approval, apply PR #39's Supabase migration, deploy the combined student-learning Edge Function from this branch, merge the reviewed web changes in order, and **install the content pack only when the admin chooses Publish**.
9. Perform limited end-to-end QA with the Jordan Lee demo profile before enabling real children: select a quiz, complete it, compare six-question scores/attempt history, retry, test a different week and check recurring assignments plus mandatory workload metrics.
10. Check how optional completions interact with Learning Goals/bonus points before making optional work generally available.

## Related unmerged pull requests

- PR #38: Smart Weekly Planner (base on main)
- PR #39: Staff-Approved Choice Board (base on #38; includes unapplied Supabase migration)
- This PR: Content pack and rotation (based on #39)
- PR #36: Juanita Quest mini-games — **paused**, not included in the above branch

Do not merge a stacked descendant directly to main without reconciling review and required backend migrations. No production release was requested.
