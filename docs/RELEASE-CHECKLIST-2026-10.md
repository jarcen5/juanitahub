# Juanita Hub — Staff release checklist

This document coordinates a staged review of the October 2026 UI polish work.
A successful Vercel build **does not** by itself verify staff workflows or authorize a production merge.

## Current source-of-truth release candidates

| Area | PR | Scope |
| --- | --- | --- |
| Rewards | #27 | Prize wheel, winning popup/sound, administrative accidental-spin reversal |
| Learning | #28 | Library, My Week, review snapshots, recommendations, Labs navigation |
| Attendance | #29 | Staff roster filters, search, date navigation |
| Cards + backfill | #30 | Today's card tracking, Students > Missed Cards, demo exclusions |
| Student Directory | #31 | Search/filter polish, demo visibility, profile navigation |
| Reports | #32 | Attendance and Behavior monthly reporting filters |
| Shared reliability | New site-wide PR | Route errors, loading and missing-page fallbacks, keyboard focus |

**Superseded review drafts:** #14–#20 have their Learning changes in #28;
#21–#26 have their wheel changes in #27. Do not merge those older
dependent branches in addition to the consolidated release candidates.
Leave the legacy PRs open until approved for closure; these are bookkeeping
instructions, not an automatic merge or close operation.

## Order of checks before production

1. Verify the intended Vercel project, GitHub main SHA, and preview SHA. Each final
   commit must have a successful build. Confirm the *combined integration*
   candidate also builds, since individually successful PRs may still conflict.
2. Check the Rewards database migration state. The admin-only spin-revocation
   migration is already applied in Supabase as version **20261028192938**;
   the GitHub SQL filename now matches that version. Check migration history
   before any production release and never re-run the Bethel spin correction.
3. Sign in as staff and admin in a preview. Check navigation permissions,
   direct links, dashboard, and normal and dark themes.
4. On a **demo/test** student only, check attendance sign-in and duplicate
   prevention, Card Tracking card/status and notes, missed-card date and
   attendance filters, and student profile behavior/rewards tabs.
5. In Learning, test Assignment Library filters, recommended next activities,
   My Week verification and all four Labs. Confirm demo accounts remain usable
   in Learning but are excluded from ordinary Card Tracking.
6. Use *Rewards Test* to validate wheel spin, sound mute, last-in-stock behavior,
   the winner popup, fullscreen/TV layout and confetti. Verify admin reversal
   permissions using a deliberately created test record only.
7. In Reports, compare filtered tables to original totals and verify the
   Attendance CSV includes the complete month, regardless of filters.
8. At approximately 375px phone, 768px tablet and desktop widths, check
   interactive controls, text overflow, empty/error/loading states and focus
   navigation. Test reduced-motion behavior on the loading screen.
9. Obtain staff approval and prepare a rollback plan before any merge or
   domain promotion. Merge candidates in a documented sequence and re-run
   combined production build/checks after resolving any conflicts.

## Known boundaries

- Preview status **READY** verifies compilation/deployment, not that every
  action or external database connection was exercised.
- A system error screen should not claim that an attempted action was undone;
  the person must inspect the relevant record before retrying a write.
- No new student, attendance, points, spin, or reward data correction is
  authorized by this checklist.
- Use live data in read-only mode for spot checks, and demo data for mutations.
