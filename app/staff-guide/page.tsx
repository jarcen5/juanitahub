'use client'

import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type StaffProfile = { active: boolean; role: 'staff' | 'admin' }
type GuideStep = { text: string; href?: string; linkText?: string }
type GuideSection = {
  id: string
  icon: string
  title: string
  purpose: string
  steps: GuideStep[]
  tip?: string
}

const sections: GuideSection[] = [
  {
    id: 'sign-in',
    icon: '🔐',
    title: 'Sign in and find your way around',
    purpose: 'Start here at the beginning of a shift.',
    steps: [
      { text: 'Sign in using your approved staff account. If your account is waiting for approval, ask an administrator.' },
      { text: 'Use the minimized sidebar to move between Students, Learning, Programs, Rewards, Operations, and Reports.' },
      { text: 'Start on the dashboard for quick links and items needing attention.', href: '/', linkText: 'Open Dashboard' },
      { text: 'Use the Appearance control at the bottom of the sidebar to change between light, dark, and system themes.' },
    ],
  },
  {
    id: 'attendance',
    icon: '✅',
    title: 'Record daily attendance',
    purpose: 'Keep the child and community sign-in counts accurate.',
    steps: [
      { text: 'Open Students → Attendance and make sure the date is correct.', href: '/attendance', linkText: 'Go to Attendance' },
      { text: 'Search for a child and select the sign-in action. Check the Signed In and Needs Sign-In filters to find anyone missing.' },
      { text: 'Use Launch Sign-In Kiosk from the sidebar when children or visitors are checking themselves in.', href: '/kiosk', linkText: 'Open Kiosk' },
      { text: 'Record community visitors separately and sign them out when they leave, where applicable.' },
      { text: 'If you need to correct an attendance record, use the provided correction/void controls so an audit trail is kept.' },
    ],
    tip: 'Do not create a second sign-in to “fix” an existing one. Review the saved entry first.',
  },
  {
    id: 'behavior',
    icon: '💎',
    title: 'Award behavior cards and note daily status',
    purpose: 'Use the current-day roster instead of editing old history.',
    steps: [
      { text: 'Open Students → Behavior (Card Tracking).', href: '/card-tracking', linkText: 'Go to Behavior' },
      { text: 'Search for the child. Choose the card or daily status that matches what happened.' },
      { text: 'Add an optional note with the daily record when useful, then save. Confirm the success message.' },
      { text: 'Use Missed Cards to enter a forgotten card or status for an earlier date; select the correct historical date first.', href: '/missed-cards', linkText: 'Open Missed Cards' },
      { text: 'Filter missed cards by sign-in status to prioritize children who attended on that date.' },
    ],
    tip: 'Archived and demo students are excluded from ordinary daily Card Tracking. Historical corrections are kept separate from new records.',
  },
  {
    id: 'directory',
    icon: '👥',
    title: 'Find or update a student profile',
    purpose: 'Keep family and student details in one protected place.',
    steps: [
      { text: 'Open Students → Student Directory and search by name, grade, or school.', href: '/children', linkText: 'Open Directory' },
      { text: 'Use the grade, registration, or status filters to narrow the list. Test students are hidden by default.' },
      { text: 'Open a student to view their Profile, Behavior, Rewards, and Progress tabs.' },
      { text: 'Use Previous and Next inside the profile to review other students without reopening the directory.' },
      { text: 'Only change protected or sensitive information when you are authorized and have verified the source.' },
    ],
  },
  {
    id: 'learning',
    icon: '📚',
    title: 'Assign work and review Learning',
    purpose: 'Help students know what is due and verify completed work.',
    steps: [
      { text: 'Open Learning Hub → This Week or Assignment Library.', href: '/learning#week', linkText: 'Open Learning' },
      { text: 'Search the Assignment Library and filter by grade, subject, favorites, recent, or recommended work.' },
      { text: 'Preview assignments before giving them to a student. Set a due date or other available assignment options.' },
      { text: 'Check Review for submissions waiting for staff verification, including school homework.', href: '/learning#review', linkText: 'Open Review' },
      { text: 'Use My Week to explain Today, School Homework, and Later This Week to a student.', href: '/learning#my-week', linkText: 'Open My Week' },
      { text: 'Use Labs for typing, quizzes, writing, and reading practice when appropriate.', href: '/learning#labs', linkText: 'Open Labs' },
    ],
    tip: 'Use the designated demo student for testing assignments. Avoid changing real students’ progress for experimentation.',
  },
  {
    id: 'rewards',
    icon: '🎁',
    title: 'Use the Reward Center and wheel',
    purpose: 'Record real wins correctly and keep test spins separate.',
    steps: [
      { text: 'Open Rewards → Monthly Spins, select the student and wheel category, and confirm available spins.', href: '/rewards#monthly', linkText: 'Open Monthly Spins' },
      { text: 'Press Spin once. The result is recorded automatically; Close the winner popup before the next spin.' },
      { text: 'For a bonus prize, use Rewards → Free Spin, choose the child, tier, and category, and optionally add a reason.', href: '/rewards#free', linkText: 'Open Free Spin' },
      { text: 'Use Test Wheel to demonstrate or check the wheel without recording a win, reducing inventory, or spending earned spins.', href: '/rewards#test', linkText: 'Open Test Wheel' },
      { text: 'Use Prize Setup for inventory and chance changes only if your account has access.', href: '/rewards#setup', linkText: 'Prize Setup (admin)' },
    ],
    tip: 'A real spin changes reward records and stock. Never use a real student spin just to test the animation.',
  },
  {
    id: 'fulfillment',
    icon: '📦',
    title: 'Give out prizes and mark them received',
    purpose: 'Keep prizes on the outstanding list until they are physically handed over.',
    steps: [
      { text: 'Open Rewards → Fulfillment. The default view shows outstanding wins from all months, including Monthly Wheel and Free Spin prizes.', href: '/rewards#fulfillment', linkText: 'Open Fulfillment' },
      { text: 'Search by child or prize, or choose a specific month if you need to review older activity.' },
      { text: 'Confirm the prize is in hand, then check it off to mark Received. Multiple prizes for one child can be marked together.' },
      { text: 'Use All or Received to review past handoffs. If a prize was marked received by mistake, use the same item to return it to outstanding.' },
    ],
    tip: 'Never mark a prize received before it has actually been given to the child. A Free Spin prize is fulfilled the same way as a Monthly Wheel prize.',
  },
  {
    id: 'programs',
    icon: '🗓️',
    title: 'Find center activities and announcements',
    purpose: 'Help staff see what is scheduled and communicate changes.',
    steps: [
      { text: 'Use Programs for program details, enrollment, and rosters.', href: '/programs', linkText: 'Open Programs' },
      { text: 'Check the Calendar for events, trips, and closures.', href: '/calendar', linkText: 'Open Calendar' },
      { text: 'Use Announcements to review or post center reminders, based on your permissions.', href: '/announcements', linkText: 'Open Announcements' },
      { text: 'Use Operations → Tasks to see assignments and items that need follow-up.', href: '/tasks', linkText: 'Open Tasks' },
    ],
  },
  {
    id: 'reports',
    icon: '📊',
    title: 'Review monthly reports',
    purpose: 'Find historical summaries without crowding the daily workspace.',
    steps: [
      { text: 'Reports → Attendance contains monthly child and community sign-ins, open-day averages, and a full-month CSV export.', href: '/reports/attendance', linkText: 'Attendance Reports' },
      { text: 'Reports → Behavior contains monthly student card totals, point summaries, and individual child history.', href: '/reports/behavior', linkText: 'Behavior Reports' },
      { text: 'Reports → Student Progress summarizes learning results and supports prepared student reports.', href: '/reports/progress', linkText: 'Student Progress' },
      { text: 'When reporting, select the correct month and verify the date range before exporting or printing.' },
    ],
  },
  {
    id: 'help',
    icon: '🛡️',
    title: 'Safety, privacy, and troubleshooting',
    purpose: 'Protect records and know what to do if a save fails.',
    steps: [
      { text: 'Do not share staff passwords, student access details, personal contact information, or sensitive profile data.' },
      { text: 'If an action looks stuck or shows an error, check whether the entry was already saved before trying again. Avoid duplicate sign-ins, cards, or spins.' },
      { text: 'If a saved record needs correction, use the built-in correction tools or ask an administrator; do not delete historical records to hide mistakes.' },
      { text: 'For a display problem, refresh once. If the problem continues, note the section, date/time, action, and error message for the administrator.' },
      { text: 'Admins can manage staff accounts and access in Staff → Account Access.', href: '/staff', linkText: 'Account Access (admin)' },
    ],
  },
]

export default function StaffGuidePage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authChecked, setAuthChecked] = useState(false)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) setAuthError(error.message)
      setSession(data.session)
      setAuthChecked(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) { setSession(nextSession); setAuthChecked(true) }
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    let active = true
    if (!authChecked) return
    if (!session) { setProfile(null); setLoading(false); return }
    setLoading(true)
    supabase.from('staff_profiles').select('active,role').eq('user_id', session.user.id).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        setProfile(data as StaffProfile | null)
        setAuthError(error?.message ?? '')
        setLoading(false)
      })
    return () => { active = false }
  }, [session, authChecked])

  if (!authChecked || loading) return <main className="main"><section className="card">Opening the staff guide…</section></main>
  if (!session || !profile?.active) {
    return <main className="main"><section className="card jh-guide-locked"><h1>Staff Quick-Start Guide</h1><p>{authError || 'Sign in with an active staff account to view this guide.'}</p><a className="primary" href="/">Return to sign in</a></section></main>
  }

  return (
    <main className="main jh-guide-page" id="guide-top">
      <section className="hero jh-guide-hero">
        <div>
          <span className="jh-guide-eyebrow">For Juanita Hub staff</span>
          <h1>Staff Quick-Start Guide</h1>
          <p>Everyday instructions for attendance, cards, Learning, Rewards, prize handoffs, and monthly reports. Keep this open during your shift or print a copy for staff.</p>
          <span className="jh-guide-version">Updated November 2026 · Applies to active staff accounts</span>
        </div>
        <button type="button" className="primary jh-guide-print" onClick={() => window.print()}>🖨 Print guide</button>
      </section>

      <section className="card jh-guide-start">
        <div><span className="jh-guide-eyebrow">At the start of a shift</span><h2>The everyday checklist</h2></div>
        <ol>
          <li>Sign in and check Today on the dashboard.</li>
          <li>Check Attendance for children who still need to sign in.</li>
          <li>Review today's cards, statuses, and staff tasks.</li>
          <li>Open Learning to see work due and submissions awaiting review.</li>
          <li>Check Rewards → Fulfillment for prizes still to give out.</li>
        </ol>
      </section>

      <nav className="card jh-guide-jump" aria-label="Staff guide contents">
        <h2>Jump to a topic</h2>
        <div>{sections.map(section => <a key={section.id} href={'#'+section.id}><span aria-hidden="true">{section.icon}</span>{section.title}</a>)}</div>
      </nav>

      <div className="jh-guide-sections">
        {sections.map((section, idx) => (
          <section className="card jh-guide-section" key={section.id} id={section.id} aria-labelledby={'title-'+section.id}>
            <div className="jh-guide-section-heading">
              <span className="jh-guide-section-icon" aria-hidden="true">{section.icon}</span>
              <div><span className="jh-guide-eyebrow">Step {String(idx+1).padStart(2,'0')}</span><h2 id={'title-'+section.id}>{section.title}</h2><p>{section.purpose}</p></div>
            </div>
            <ol>{section.steps.map((step, i) => <li key={i}><span>{step.text}</span>{step.href && <a className="jh-guide-link" href={step.href}>{step.linkText ?? 'Open section'} ↗</a>}</li>)}</ol>
            {section.tip && <p className="jh-guide-tip"><strong>Remember:</strong> {section.tip}</p>}
            <a className="jh-guide-back" href="#guide-top">Back to top ↑</a>
          </section>
        ))}
      </div>

      <footer className="jh-guide-footer">Juanita Hub staff reference · For operational questions or corrections, contact a center administrator.</footer>
    </main>
  )
}
