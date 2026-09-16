'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

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

export default function StaffHomePage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [children, setChildren] = useState<Child[]>([])
  const [entries, setEntries] = useState<BehaviorEntry[]>([])
  const [attendanceVisits, setAttendanceVisits] = useState<AttendanceVisit[]>([])
  const [operatingDay, setOperatingDay] = useState<OperatingDay | null>(null)
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
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
      return
    }

    void loadDashboard()
  }, [session])

  async function loadDashboard() {
    if (!session) return
    setLoading(true)

    const [profileResult, childrenResult, entriesResult, attendanceResult, operatingResult, calendarResult] = await Promise.all([
      supabase
        .from('staff_profiles')
        .select('display_name, role, active')
        .eq('user_id', session.user.id)
        .maybeSingle(),
      supabase
        .from('children')
        .select('id, first_name, last_name, active')
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
    ])

    setProfile(profileResult.data as StaffProfile | null)
    setChildren((childrenResult.data ?? []) as Child[])
    setEntries((entriesResult.data ?? []) as BehaviorEntry[])
    setAttendanceVisits((attendanceResult.data ?? []) as AttendanceVisit[])
    setOperatingDay(operatingResult.data as OperatingDay | null)
    setCalendarEvents((calendarResult.data ?? []) as CalendarEvent[])
    setMessage(profileResult.error?.message ?? childrenResult.error?.message ?? entriesResult.error?.message ?? attendanceResult.error?.message ?? operatingResult.error?.message ?? calendarResult.error?.message ?? '')
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

  const completedCards = useMemo(() => new Set(entries.map((entry) => entry.child_id)).size, [entries])
  const missingCards = Math.max(0, children.length - completedCards)
  const signedInChildIds = useMemo(() => new Set(attendanceVisits.filter((visit) => visit.participant_type === 'child' && visit.child_id != null).map((visit) => visit.child_id)), [attendanceVisits])
  const childSignIns = signedInChildIds.size
  const childrenNotSignedIn = Math.max(0, children.length - childSignIns)
  const communityPresent = attendanceVisits.filter((visit) => visit.participant_type !== 'child' && !visit.signed_out_at).length
  const presentNow = childSignIns + communityPresent
  const communitySignIns = attendanceVisits.filter((visit) => visit.participant_type !== 'child').length

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

        <section className="home-quick-grid" aria-label="Quick actions">
          <Link className="home-quick-action blue" href="/attendance"><span className="home-quick-icon">✓</span><span><strong>Attendance</strong><small>{childSignIns} children • {communitySignIns} community sign-ins today</small></span></Link>
          <Link className="home-quick-action green" href="/card-tracking"><span className="home-quick-icon">◆</span><span><strong>Card Tracking</strong><small>{missingCards === 0 ? 'All active children have a record today' : `${missingCards} children still need a card/status`}</small></span></Link>
          <Link className="home-quick-action yellow" href="/rewards"><span className="home-quick-icon">★</span><span><strong>Reward Center</strong><small>Monthly spins and prize inventory</small></span></Link>
          <Link replace className="home-quick-action purple" href="/kiosk"><span className="home-quick-icon">☺</span><span><strong>Launch Sign-In Kiosk</strong><small>Welcome board plus child and visitor sign-in</small></span></Link>
        </section>

        <section className="home-layout">
          <div className="home-main-column">
            <section className="card home-board-card">
              <div className="home-section-heading"><div><span className="home-section-kicker">Bulletin board</span><h2>Announcements</h2></div><span className="home-preview-pill">Preview content</span></div>
              <div className="home-announcements">
                <article className="home-announcement important"><span className="home-announcement-icon">📌</span><div><strong>Staff reminder</strong><p>Announcements will eventually be editable by admins and can appear for one day, a date range, or on a repeating schedule.</p></div></article>
                <article className="home-announcement"><span className="home-announcement-icon">🎨</span><div><strong>Example daily activity</strong><p>Art activity at 4:00 PM • Homework support afterward.</p></div></article>
                <article className="home-announcement"><span className="home-announcement-icon">🖨️</span><div><strong>Example community note</strong><p>Computer, printing, faxing, and forms assistance available during center hours.</p></div></article>
              </div>
            </section>

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
          </div>

          <aside className="home-side-column">
            <section className="card home-snapshot-card">
              <span className="home-section-kicker">Today’s snapshot</span><h2>Operations</h2>
              <div className="home-snapshot-grid">
                <div><strong>{presentNow}</strong><span>Here now</span><small>{childSignIns} children + {communityPresent} community</small></div>
                <div><strong>{childSignIns}</strong><span>Children signed in</span><small>of {children.length} active</small></div>
                <div><strong>{completedCards}</strong><span>Cards/statuses entered</span><small>{missingCards} still missing</small></div>
                <div><strong>{communitySignIns}</strong><span>Community sign-ins</span><small>Today's total visits</small></div>
              </div>
            </section>

            <section className="card home-birthday-card">
              <div className="home-section-heading compact"><div><span className="home-section-kicker">Celebrate</span><h2>Birthdays</h2></div><span aria-hidden="true" className="home-birthday-emoji">🎂</span></div>
              <p className="subtle">Once participant profiles include birthdays, today’s and upcoming birthdays can appear here automatically.</p>
              <div className="home-empty-state">No birthday data connected yet.</div>
            </section>

            <section className="card home-attention-card">
              <span className="home-section-kicker">Needs attention</span><h2>Today</h2>
              <div className="home-attention-list">
                {childrenNotSignedIn > 0 ? <Link href="/attendance"><strong>{childrenNotSignedIn} child {childrenNotSignedIn === 1 ? 'has' : 'have'} not signed in</strong><small>Open Attendance →</small></Link> : <div className="home-all-clear"><strong>✓ All active children are signed in</strong><small>Attendance roster is complete for today.</small></div>}
                {missingCards > 0 ? <Link href="/card-tracking"><strong>{missingCards} card/status {missingCards === 1 ? 'entry is' : 'entries are'} still missing</strong><small>Open Card Tracking →</small></Link> : <div className="home-all-clear"><strong>✓ Card tracking is complete</strong><small>All active children have an entry today.</small></div>}
              </div>
            </section>
          </aside>
        </section>

        <section className="card home-roadmap">
          <div><span className="home-section-kicker">Juanita Hub operations</span><h2>Calendar and attendance now feed the daily home page</h2><p>Center plans and saved sign-ins can be managed once and reflected throughout Juanita Hub. Inventory, purchasing, programs, and staff/intern scheduling can be layered in next.</p></div>
          <div className="home-roadmap-tags" aria-label="Juanita Hub areas"><span>Attendance ✓</span><span>Calendar ✓</span><span>Reports ✓</span><span>Inventory</span><span>Staff Scheduling</span></div>
        </section>
      </main>
    </div>
  )
}
