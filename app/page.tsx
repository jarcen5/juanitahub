'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import RewardFulfillmentTask from '@/components/RewardFulfillmentTask'
import RegistrationReviewTask from '@/components/RegistrationReviewTask'
import DashboardTaskCard from '@/components/DashboardTaskCard'
import InventoryLowStockTask from '@/components/InventoryLowStockTask'
import PurchasingAttentionTask from '@/components/PurchasingAttentionTask'

type StaffProfile = {
  display_name: string
  role: 'staff' | 'admin'
  active: boolean
}

type Child = {
  id: number
  first_name: string
  last_name: string | null
  active: boolean
  is_demo: boolean
}

type BehaviorEntry = {
  child_id: number
  entry_date: string
}

type AttendanceVisit = {
  participant_type: 'child' | 'adult' | 'family' | 'visitor'
  child_id: number | null
  signed_out_at: string | null
}

type OperatingDay = {
  is_open: boolean
  reason: string | null
}

type CalendarEvent = {
  id: number
  title: string
  event_type: string
  all_day: boolean
  start_time: string | null
  end_time: string | null
  location: string | null
  status: 'scheduled' | 'canceled'
  visibility: 'public' | 'staff'
}

type BirthdayRegistration = {
  child_id: number
  birth_date: string | null
}

function localDateString(date = new Date()) {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

function formatToday() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatCalendarTime(value: string | null) {
  if (!value) return ''
  const [hourString, minuteString] = value.split(':')
  const date = new Date(2000, 0, 1, Number(hourString), Number(minuteString))
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function calendarTimeLabel(event: CalendarEvent) {
  if (event.all_day) return 'All day'
  if (!event.start_time) return 'TBD'
  return formatCalendarTime(event.start_time)
}

function calendarIcon(type: string) {
  if (type === 'field_trip') return '🚌'
  if (type === 'club') return '⭐'
  if (type === 'program') return '📚'
  if (type === 'meeting') return '👥'
  if (type === 'closure') return '🔒'
  if (type === 'special_event') return '✨'
  if (type === 'activity') return '🎨'
  return '📌'
}

function daysUntilBirthday(birthDate: string) {
  const [, monthString, dayString] = birthDate.split('-')
  const month = Number(monthString) - 1
  const day = Number(dayString)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let next = new Date(now.getFullYear(), month, day)
  if (next < todayStart) next = new Date(now.getFullYear() + 1, month, day)
  return Math.round((next.getTime() - todayStart.getTime()) / 86_400_000)
}

function birthdayDateLabel(birthDate: string) {
  const [, monthString, dayString] = birthDate.split('-')
  return new Date(2000, Number(monthString) - 1, Number(dayString)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function StaffHomePage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [children, setChildren] = useState<Child[]>([])
  const [entries, setEntries] = useState<BehaviorEntry[]>([])
  const [attendanceVisits, setAttendanceVisits] = useState<AttendanceVisit[]>([])
  const [operatingDay, setOperatingDay] = useState<OperatingDay | null>(null)
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [birthdayRegistrations, setBirthdayRegistrations] = useState<BirthdayRegistration[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const today = localDateString()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setProfile(null)
      setChildren([])
      setEntries([])
      setAttendanceVisits([])
      setOperatingDay(null)
      setCalendarEvents([])
      setBirthdayRegistrations([])
      return
    }

    void loadDashboard()
  }, [session])

  async function loadDashboard() {
    if (!session) return
    setLoading(true)

    const [profileResult, childrenResult, entriesResult, attendanceResult, operatingResult, calendarResult, birthdayResult] = await Promise.all([
      supabase
        .from('staff_profiles')
        .select('display_name, role, active')
        .eq('user_id', session.user.id)
        .maybeSingle(),
      supabase
        .from('children')
        .select('id, first_name, last_name, active, is_demo')
        .eq('active', true)
        .order('first_name'),
      supabase
        .from('behavior_entries')
        .select('child_id, entry_date')
        .eq('entry_date', today),
      supabase
        .from('attendance_visits')
        .select('participant_type, child_id, signed_out_at')
        .eq('service_date', today)
        .eq('status', 'active'),
      supabase
        .from('operating_days')
        .select('is_open, reason')
        .eq('service_date', today)
        .maybeSingle(),
      supabase
        .from('calendar_events')
        .select('id, title, event_type, all_day, start_time, end_time, location, status, visibility')
        .eq('event_date', today)
        .order('start_time'),
      supabase
        .from('child_registrations')
        .select('child_id, birth_date')
        .eq('status', 'active')
        .not('birth_date', 'is', null),
    ])

    setProfile(profileResult.data as StaffProfile | null)
    setChildren((childrenResult.data ?? []) as Child[])
    setEntries((entriesResult.data ?? []) as BehaviorEntry[])
    setAttendanceVisits((attendanceResult.data ?? []) as AttendanceVisit[])
    setOperatingDay(operatingResult.data as OperatingDay | null)
    setCalendarEvents((calendarResult.data ?? []) as CalendarEvent[])
    setBirthdayRegistrations((birthdayResult.data ?? []) as BirthdayRegistration[])
    setMessage(profileResult.error?.message ?? childrenResult.error?.message ?? entriesResult.error?.message ?? attendanceResult.error?.message ?? operatingResult.error?.message ?? calendarResult.error?.message ?? birthdayResult.error?.message ?? '')
    setLoading(false)
  }

  async function handleAuth() {
    setMessage('')

    if (!email || !password) {
      setMessage('Enter an email address and password.')
      return
    }

    if (authMode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMessage(error.message)
      return
    }

    const { error } = await supabase.auth.signUp({ email, password })
    if (error) setMessage(error.message)
    else setMessage('Account created. An administrator must activate your staff profile before you can use Juanita Hub.')
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const reportingChildren = useMemo(() => children.filter((child) => !child.is_demo), [children])
  const reportingChildIds = useMemo(() => new Set(reportingChildren.map((child) => child.id)), [reportingChildren])
  const completedCards = useMemo(() => new Set(entries.filter((entry) => reportingChildIds.has(entry.child_id)).map((entry) => entry.child_id)).size, [entries, reportingChildIds])
  const missingCards = Math.max(0, reportingChildren.length - completedCards)
  const signedInChildIds = useMemo(() => new Set(attendanceVisits
    .filter((visit) => visit.participant_type === 'child' && visit.child_id != null && reportingChildIds.has(visit.child_id))
    .map((visit) => visit.child_id)), [attendanceVisits, reportingChildIds])
  const childSignIns = signedInChildIds.size
  const childrenNotSignedIn = Math.max(0, reportingChildren.length - childSignIns)
  const communityPresent = attendanceVisits.filter((visit) => visit.participant_type !== 'child' && !visit.signed_out_at).length
  const presentNow = childSignIns + communityPresent
  const communitySignIns = attendanceVisits.filter((visit) => visit.participant_type !== 'child').length

  const upcomingBirthdays = useMemo(() => {
    const childMap = new Map(reportingChildren.map((child) => [child.id, child]))
    return birthdayRegistrations
      .filter((registration): registration is BirthdayRegistration & { birth_date: string } => Boolean(registration.birth_date))
      .map((registration) => ({ registration, child: childMap.get(registration.child_id), days: daysUntilBirthday(registration.birth_date) }))
      .filter((item) => item.child && item.days <= 7)
      .sort((a, b) => a.days - b.days || (a.child?.first_name ?? '').localeCompare(b.child?.first_name ?? ''))
      .slice(0, 5)
  }, [birthdayRegistrations, reportingChildren])

  const centerStatus = !operatingDay
    ? 'Not recorded yet'
    : operatingDay.is_open
      ? 'Open today'
      : `Closed${operatingDay.reason ? ` • ${operatingDay.reason}` : ''}`

  if (loading && !session) {
    return <main className="login-wrap"><div className="card login-card">Loading Juanita Hub…</div></main>
  }

  if (!session) {
    return (
      <main className="login-wrap">
        <section className="card login-card">
          <h1>Juanita Hub</h1>
          <p className="subtle">Staff sign-in</p>
          <div className="field"><label>Email</label><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" /></div>
          <div className="field"><label>Password</label><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} /></div>
          {authMode === 'signin' && <Link className="forgot-password-link" href="/forgot-password">Forgot password?</Link>}
          {message && <div className="notice">{message}</div>}
          <button className="primary" type="button" onClick={handleAuth}>{authMode === 'signin' ? 'Sign in' : 'Create account'}</button>
          <button className="link-button" type="button" onClick={() => setAuthMode((mode) => mode === 'signin' ? 'signup' : 'signin')}>
            {authMode === 'signin' ? 'Need an account?' : 'Already have an account?'}
          </button>
        </section>
      </main>
    )
  }

  if (!profile?.active) {
    return (
      <main className="login-wrap">
        <section className="card login-card">
          <h1>Juanita Hub</h1>
          <div className="notice">Your staff account is waiting for administrator approval.</div>
          <button className="ghost" type="button" onClick={signOut}>Sign out</button>
        </section>
      </main>
    )
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Juanita Hub<small>Staff home</small></div>
        <div className="toolbar"><span>{profile.display_name} <span className="badge">{profile.role}</span></span><button className="ghost" type="button" onClick={signOut}>Sign out</button></div>
      </header>

      <main className="main home-dashboard">
        <section className="home-welcome">
          <div><span className="home-eyebrow">Today at Juanita</span><h1>{formatToday()}</h1><p>Everything staff need for today, in one place.</p></div>
          <div className="home-center-status"><span className="home-status-dot" aria-hidden="true" /><span><strong>Center status</strong><small>{centerStatus}</small></span></div>
        </section>

        {message && <div className="notice">{message}</div>}

        <section className="card home-find-card home-fast-card">
          <div className="home-section-heading compact">
            <div><span className="home-section-kicker">Find it fast</span><h2>Daily shortcuts</h2></div>
            <p className="subtle">The four tools staff use most often.</p>
          </div>
          <div className="home-quick-grid" aria-label="Quick actions">
            <Link className="home-quick-action blue" href="/attendance"><span className="home-quick-icon">✓</span><span><strong>Attendance</strong><small>{childSignIns} children • {communitySignIns} community sign-ins today</small></span></Link>
            <Link className="home-quick-action green" href="/card-tracking"><span className="home-quick-icon">◆</span><span><strong>Card Tracking</strong><small>{missingCards === 0 ? 'All active children have a record today' : `${missingCards} children still need a card/status`}</small></span></Link>
            <Link className="home-quick-action yellow" href="/rewards"><span className="home-quick-icon">★</span><span><strong>Reward Center</strong><small>Monthly spins and prize inventory</small></span></Link>
            <Link replace className="home-quick-action purple" href="/kiosk"><span className="home-quick-icon">☺</span><span><strong>Launch Sign-In Kiosk</strong><small>Welcome board plus child and visitor sign-in</small></span></Link>
          </div>
        </section>

        <details className="card home-today-overview">
          <summary>
            <span className="home-overview-summary-copy"><span className="home-section-kicker">Today at a glance</span><strong>Snapshot, assigned work & attention items</strong></span>
            <span className="home-overview-summary-stats">
              <span><strong>{presentNow}</strong><small>here now</small></span>
              <span><strong>{childSignIns}</strong><small>children signed in</small></span>
              <span><strong>{missingCards}</strong><small>cards remaining</small></span>
            </span>
            <span className="home-overview-chevron" aria-hidden="true">⌄</span>
          </summary>
          <div className="home-overview-body">
            <section className="home-overview-panel home-snapshot-card">
              <div className="home-section-heading compact"><div><span className="home-section-kicker">Snapshot</span><h2>Today</h2></div></div>
              <div className="home-snapshot-grid">
                <div><strong>{presentNow}</strong><span>Here now</span><small>{childSignIns} children + {communityPresent} community</small></div>
                <div><strong>{childSignIns}</strong><span>Children signed in</span><small>of {reportingChildren.length} active</small></div>
                <div><strong>{completedCards}</strong><span>Cards/statuses entered</span><small>{missingCards} still missing</small></div>
                <div><strong>{communitySignIns}</strong><span>Community sign-ins</span><small>Today's total visits</small></div>
              </div>
            </section>

            <DashboardTaskCard compact />

            <section className="home-overview-panel home-attention-card">
              <div className="home-section-heading compact"><div><span className="home-section-kicker">Needs attention</span><h2>Today</h2></div></div>
              <div className="home-attention-list">
                {childrenNotSignedIn > 0 ? <Link href="/attendance"><strong>{childrenNotSignedIn} child {childrenNotSignedIn === 1 ? 'has' : 'have'} not signed in</strong><small>Open Attendance →</small></Link> : <div className="home-all-clear"><strong>✓ All active children are signed in</strong><small>Attendance roster is complete for today.</small></div>}
                {missingCards > 0 ? <Link href="/card-tracking"><strong>{missingCards} card/status {missingCards === 1 ? 'entry is' : 'entries are'} still missing</strong><small>Open Card Tracking →</small></Link> : <div className="home-all-clear"><strong>✓ Card tracking is complete</strong><small>All active children have an entry today.</small></div>}
                <RewardFulfillmentTask />
                <RegistrationReviewTask />
                <InventoryLowStockTask />
                <PurchasingAttentionTask />
              </div>
            </section>
          </div>
        </details>

        <section className="home-content-grid">
          <section className="card home-schedule-card">
            <div className="home-section-heading"><div><span className="home-section-kicker">What’s happening</span><h2>Today’s Schedule</h2></div><Link className="ghost" href="/calendar">Open calendar →</Link></div>
            <div className="home-schedule-list">
              {calendarEvents.length === 0 && <div className="home-empty-state">No calendar events are planned for today yet.</div>}
              {calendarEvents.map((event) => (
                <div className="home-schedule-row" key={event.id}>
                  <time>{calendarTimeLabel(event)}</time>
                  <span>
                    <strong>{calendarIcon(event.event_type)} {event.status === 'canceled' ? `Canceled: ${event.title}` : event.title}</strong>
                    <small>{[event.location, event.visibility === 'staff' ? 'Staff only' : null].filter(Boolean).join(' • ') || 'Center calendar'}</small>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="card home-board-card">
            <div className="home-section-heading compact"><div><span className="home-section-kicker">Staff board</span><h2>Announcements & Birthdays</h2></div></div>
            <div className="home-board-section">
              <div className="home-board-subheading"><span>📌</span><strong>Announcements</strong><span className="home-preview-pill">Coming soon</span></div>
              <div className="home-announcements">
                <article className="home-announcement"><span className="home-announcement-icon">📌</span><div><strong>No staff announcements posted</strong><p>This space is reserved for real center reminders once the announcement editor is added.</p></div></article>
              </div>
            </div>
            <div className="home-board-divider" />
            <div className="home-board-section">
              <div className="home-board-subheading"><span>🎂</span><strong>Birthdays</strong></div>
              {upcomingBirthdays.length === 0 ? (
                <div className="home-empty-state">No birthdays in the next 7 days.</div>
              ) : (
                <div className="home-attention-list">
                  {upcomingBirthdays.map(({ registration, child, days }) => child && (
                    <Link href="/children" key={registration.child_id}>
                      <strong>{days === 0 ? '🎉 Today: ' : '🎂 '}{child.first_name}{child.last_name ? ` ${child.last_name}` : ''}</strong>
                      <small>{days === 0 ? 'Birthday today!' : `${birthdayDateLabel(registration.birth_date)} • ${days} day${days === 1 ? '' : 's'} away`}</small>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>
        </section>
      </main>
    </div>
  )
}
