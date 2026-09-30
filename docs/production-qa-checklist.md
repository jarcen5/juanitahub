# Juanita Hub — Pre-Production QA Checklist

Use this checklist on the `organization-redesign` preview before merging to production.

## Test accounts

Use two separate staff logins:

- **Admin** — confirms full setup/management controls work.
- **Staff** — confirms daily workflows work while admin-only controls stay hidden or blocked.

Important: at the time this checklist was created, all active Juanita Hub staff profiles were Admin accounts. Create or approve a dedicated Staff test account before the coworker QA round rather than changing a real administrator.

Use **Demo/Test students** whenever a workflow would otherwise create fake student data. Demo students should remain usable but excluded from center-wide totals.

---

## 1. Navigation & responsive layout

### Desktop
- [ ] Sidebar starts minimized.
- [ ] Expanding it shows only Home + top-level areas.
- [ ] No duplicate child-page links appear inside the sidebar.
- [ ] Page-level workspace tabs navigate correctly.
- [ ] Sidebar minimizes again after navigation.
- [ ] Student Learning and Kiosk launch links are easy to find.

### Tablet
- [ ] Sidebar stays off-screen until Menu is tapped.
- [ ] Drawer opens and closes without covering controls incorrectly.
- [ ] Workspace tabs remain usable and do not overflow badly.
- [ ] Forms and dialogs fit without horizontal scrolling.

### Phone
- [ ] Mobile header/Menu works.
- [ ] Cards stack cleanly.
- [ ] Modals fit the viewport.
- [ ] Buttons remain large enough to tap.
- [ ] Kiosk and Student Learning remain full-screen/restricted as intended.

---

## 2. Staff vs Admin access

### Staff should be able to
- [ ] View Student Directory.
- [ ] Record/correct Attendance.
- [ ] Record/correct Behavior Cards.
- [ ] View Programs and Calendar.
- [ ] Use Tasks assigned to them and create their own tasks.
- [ ] View Inventory.
- [ ] Assign existing Learning work to students.
- [ ] Add/update Learning Notes.
- [ ] Create and approve Learning Goals.
- [ ] Review Reading/Writing work.
- [ ] Use Rewards, spin wheels, and mark prizes received.
- [ ] View Attendance and Student Progress reports.
- [ ] Finalize/archive Progress Reports.

### Staff should NOT be able to
- [ ] Add/edit/archive student profiles or registrations.
- [ ] Change Learning Access.
- [ ] Create/edit Assignment Library templates.
- [ ] Edit Programs or Calendar setup.
- [ ] Open Registration Center admin tools.
- [ ] Change Inventory setup or stock records.
- [ ] Open Budgets & Purchasing.
- [ ] Change Reward prize/tier/category setup.
- [ ] Edit Team/Schedule setup.
- [ ] Open Account Access.
- [ ] Open Lab Devices.
- [ ] Call Admin-only actions by navigating directly to their URLs.

### Admin should be able to
- [ ] Perform every intended Staff workflow.
- [ ] Edit students/registrations.
- [ ] Manage Programs/Registration.
- [ ] Manage Inventory and Purchasing.
- [ ] Manage Reward setup.
- [ ] Manage Team/Schedules.
- [ ] Approve/deactivate staff accounts.
- [ ] Enable/disable Student Learning Access.
- [ ] Rename/revoke Computer Lab devices.

---

## 3. Students

- [ ] Search Student Directory by name/school/grade.
- [ ] Open a student profile.
- [ ] Profile and Progress tabs switch correctly.
- [ ] Registration data displays correctly.
- [ ] Household/family links display correctly.
- [ ] Learning Access toggle works for Admin.
- [ ] Demo/Test badge is obvious.
- [ ] Demo/Test status can be changed only by Admin.
- [ ] Demo student remains excluded from aggregate counts.

---

## 4. Attendance

- [ ] Sign a child in.
- [ ] Sign community/adult visitor in and out.
- [ ] Record wellbeing/mood where applicable.
- [ ] Correct/void a mistaken visit.
- [ ] Daily counts update immediately.
- [ ] Demo student can be tested but does not increase real-center totals.
- [ ] Monthly Attendance report matches the daily records.
- [ ] CSV/export still works.

---

## 5. Behavior Cards

- [ ] Record each normal card/status type.
- [ ] Points calculate correctly.
- [ ] Correct an entry.
- [ ] Missed Cards can backfill a previous day.
- [ ] Monthly child summaries match entries.
- [ ] Learning Goal bonus points appear separately from behavior points.
- [ ] Demo student activity does not affect center summary statistics.

---

## 6. Learning — Staff side

- [ ] This Week loads the correct week.
- [ ] Assign existing activity to one student.
- [ ] Assign by grade/group if applicable.
- [ ] Assignment Library preview works.
- [ ] Admin can create/edit an Assignment Library item.
- [ ] Staff cannot edit Assignment Library setup.
- [ ] Review Center shows submitted Writing/Reading work.
- [ ] Reached Learning Goals appear in Review.
- [ ] Review badge count matches pending items.
- [ ] Staff Notes save and reload.
- [ ] Typing/Quiz/Reading/Writing Lab summaries update after student work.

---

## 7. Student Learning / Computer Lab

Use a Demo/Test student for the full run.

- [ ] Activate a browser as a lab device.
- [ ] Staff session signs out after activation.
- [ ] Student roster loads without exposing protected data.
- [ ] Correct birthday PIN logs student in.
- [ ] Wrong PIN attempts are handled/locked as designed.
- [ ] My Week shows only that student’s assignments.
- [ ] Goals and Achievements display.
- [ ] Start Writing assignment.
- [ ] Save draft.
- [ ] Sign out.
- [ ] Sign back in and resume the same draft.
- [ ] Submit Writing.
- [ ] Complete a Quiz.
- [ ] Complete Typing.
- [ ] Complete Reading.
- [ ] Completion/results reach staff Review Center.
- [ ] Student inactivity/session timeout works.
- [ ] Student sign-out clears the student session.

---

## 8. Learning Goals & Achievements

- [ ] Suggested goals look challenging but reasonable.
- [ ] Maximum of 2 open point-earning goals is enforced.
- [ ] Reading-minute goal tracks automatically.
- [ ] Assignment-completion goal tracks automatically.
- [ ] Writing-submission goal tracks automatically.
- [ ] Quiz goal counts distinct assignments.
- [ ] Typing accuracy goal counts distinct assignments.
- [ ] Typing WPM goal requires the accuracy safeguard.
- [ ] Custom goal check-ins work.
- [ ] Reached goal waits for staff approval.
- [ ] Approving adds exactly +1 Learning Goal Bonus point.
- [ ] Bonus contributes to Rewards spin calculation.
- [ ] Achievements unlock without adding points.

---

## 9. Student Progress Reports

- [ ] 30-day, 90-day, month, school-year, and custom ranges load.
- [ ] Metrics match underlying Learning data.
- [ ] Report comment saves/reloads.
- [ ] Private staff notes appear on-screen only.
- [ ] Print/Save PDF hides internal controls/notes.
- [ ] Finalize Report creates a frozen snapshot.
- [ ] Finalized report appears in Report History.
- [ ] Frozen snapshot remains unchanged after newer Learning activity is added.
- [ ] Archive keeps the snapshot accessible.
- [ ] Student Profile → Progress shows Report History.
- [ ] Demo/Test report works without contaminating aggregate reporting.

---

## 10. Programs & Registration

### Staff
- [ ] Can view Programs/rosters/calendar.
- [ ] Cannot change program setup.

### Admin
- [ ] Create/edit Program.
- [ ] Registration options/consents save.
- [ ] Public registration link loads while signed out.
- [ ] New-family submission works.
- [ ] Returning-family token flow works.
- [ ] Required consents are enforced.
- [ ] Submission review/approval works.
- [ ] Sensitive returning-family data requires a valid token.

---

## 11. Rewards

- [ ] Monthly earned spins match Behavior + approved Learning Goal bonuses.
- [ ] Diamond bonus behavior remains correct.
- [ ] Monthly wheel spins exactly once per available spin.
- [ ] Free Spin works with intended tier/category.
- [ ] Out-of-stock prizes cannot be won.
- [ ] Prize inventory decreases correctly.
- [ ] Fulfillment marks Received without changing original win details.
- [ ] Test Wheel creates no real prize/point records.
- [ ] Staff cannot edit Prize Setup.
- [ ] Admin can edit Prize Setup.

---

## 12. Operations

### Tasks
- [ ] Staff can create a personal task.
- [ ] Staff can update their assigned task.
- [ ] Staff cannot edit another staff member’s unrelated task.
- [ ] Admin can manage team tasks.

### Inventory
- [ ] Staff can view inventory.
- [ ] Staff does not see functional Admin-only edit controls.
- [ ] Admin can manage items/categories/locations/stock.
- [ ] Stock history remains correct after adjustments.

### Purchasing
- [ ] Staff cannot open/use purchasing admin tools.
- [ ] Admin can manage budgets, requests, approvals, orders, receiving, and personnel costs.

---

## 13. Staff & Computer Lab security

### Staff Management
- [ ] Pending account requires Admin approval.
- [ ] Staff role gets Staff navigation/permissions.
- [ ] Admin role gets Admin navigation/permissions.
- [ ] Admin cannot accidentally deactivate/demote their own admin account.
- [ ] Deactivated account immediately loses protected access.

### Lab Devices
- [ ] Admin sees active devices.
- [ ] Device can be renamed.
- [ ] Last-used time updates after Student Learning use.
- [ ] Active session count looks reasonable.
- [ ] Staff cannot access Lab Devices.
- [ ] Revoking device immediately blocks its Student Learning credential.
- [ ] Revoking device signs out active student sessions.
- [ ] Revoked device remains in audit history.
- [ ] Re-using that computer requires a fresh activation.

---

## 14. Error / recovery checks

- [ ] Refreshing a page does not lose saved records.
- [ ] Double-clicking Save/Submit does not create duplicates.
- [ ] Browser Back/Forward does not break workspace state.
- [ ] Sign-out returns to a safe state.
- [ ] Expired sessions fail safely.
- [ ] Empty states make sense when no records exist.
- [ ] Errors are understandable and do not expose database details/tokens.
- [ ] Student Learning never exposes device credentials or protected student data in the UI.

---

## 15. Final go/no-go review

Before production:
- [ ] At least one Admin completes this checklist.
- [ ] At least one coworker completes the main workflows as Staff without coaching.
- [ ] Test on desktop.
- [ ] Test on tablet.
- [ ] Test on phone.
- [ ] All known critical/high issues are fixed.
- [ ] No Demo/Test records appear in real-center aggregate reports.
- [ ] Computer Lab devices are named and any accidental/stale activations are revoked.
- [ ] Supabase leaked-password protection is enabled.
- [ ] Final preview build is READY.
- [ ] Production merge is explicitly approved.
