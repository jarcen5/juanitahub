'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Child = {
  id: number
  first_name: string
  last_name: string | null
}

type Profile = {
  active: boolean
}

type Mood = 'happy' | 'meh' | 'sad'
type KioskView = 'home' | 'children' | 'community'
type VisitorType = 'Adult' | 'Family' | 'Visitor'

type KioskRecord = {
  visitId: number
  time: string
}

type AttendanceVisit = {
  id: number
  participant_type: 'child' | 'adult' | 'family' | 'visitor'
  child_id: number | null
  signed_in_at: string
}

type SignInResult = {
  visit_id: number
  signed_in_at: string
}

type PublicCalendarEvent = {
  id: number
  event_date: string
  title: string
  event_type: string
  description: string | null
  location: string | null
  all_day: boolean
  start_time: string | null
  end_time: string | null
  status: 'scheduled' | 'canceled'
}

type PublicBirthday = {
  child_id: number
  first_name: string
  birth_month: number
  birth_day: number
}

const moods: Array<{ value: Mood; emoji: string; label: string }> = [
  { value: 'happy', emoji: '😀', label: 'Good' },
  { value: 'meh', emoji: '😐', label: 'Meh' },
  { value: 'sad', emoji: '🙁', label: 'Not great' },
]

const purposes = [
  'Program / Activity',
  'Computer use',
  'Printing / Faxing',
  'Forms / Assistance',
  'Meeting / Event',
  'Other',
]

function childName(child: Child) {
  return `${child.first_name}${child.last_name ? ` ${child.last_name}` : ''}`
}

function localDateKey() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatCalendarTime(value: string | null) {
  if (!value) return ''
  const [hourString, minuteString] = value.split(':')
  const date = new Date(2000, 0, 1, Number(hourString), Number(minuteString))
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function calendarTimeLabel(event: PublicCalendarEvent) {
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

function formatToday() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export default function KioskPage() {
  const router = useRouter()
  const holdTimer = useRef<number | null>(null)
  const allowNavigation = useRef(false)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [children, setChildren] = useState<Child[]>([])
  const [calendarEvents, setCalendarEvents] = useState<PublicCalendarEvent[]>([])
  const [birthdays, setBirthdays] = useState<PublicBirthday[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<KioskView>('home')
  const [search, setSearch] = useState('')
  const [selectedChild, setSelectedChild] = useState<Child | null>(null)
  const [records, setRecords] = useState<Record<number, KioskRecord>>({})
  const [communityCount, setCommunityCount] = useState(0)
  const [visitorName, setVisitorName] = useState('')
  const [visitorType, setVisitorType] = useState<VisitorType>('Adult')
  const [purpose, setPurpose] = useState(purposes[0])
  const [celebration, setCelebration] = useState<{ title: string; subtitle: string; emoji: string } | null>(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [unlockError, setUnlockError] = useState('')
  const [unlocking, setUnlocking] = useState(false)

  const today = localDateKey()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!session) return
    void loadKioskData()
  }, [session])

  useEffect(() => {
    if (!session) return
    const refresh = window.setInterval(() => void loadKioskData(), 5 * 60 * 1000)
    return () => window.clearInterval(refresh)
  }, [session])

  useEffect(() => {
    const handlePopState = () => {
      if (!allowNavigation.current) {
        window.history.pushState({ kiosk: true }, '', window.location.href)
      }
    }

    window.history.pushState({ kiosk: true }, '', window.location.href)
    window.addEventListener('popstate', handlePopState)

    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current)
  }, [])

  async function loadKioskData() {
    if (!session) return
    setLoading(true)
    setMessage('')

    const [profileResult, childrenResult, visitsResult, calendarResult, birthdaysResult] = await Promise.all([
      supabase
        .from('staff_profiles')
        .select('active')
        .eq('user_id', session.user.id)
        .maybeSingle(),
      supabase
        .from('children')
        .select('id, first_name, last_name')
        .eq('active', true)
        .order('first_name')
        .order('last_name'),
      supabase
        .from('attendance_visits')
        .select('id, participant_type, child_id, signed_in_at')
        .eq('service_date', today)
        .eq('status', 'active')
        .order('signed_in_at', { ascending: true }),
      supabase
        .from('calendar_public_events')
        .select('id, event_date, title, event_type, description, location, all_day, start_time, end_time, status')
        .eq('event_date', today)
        .order('start_time'),
      supabase
        .from('kiosk_public_birthdays')
        .select('child_id, first_name, birth_month, birth_day'),
    ])

    if (profileResult.error || childrenResult.error || visitsResult.error || calendarResult.error || birthdaysResult.error) {
      setMessage(profileResult.error?.message ?? childrenResult.error?.message ?? visitsResult.error?.message ?? calendarResult.error?.message ?? birthdaysResult.error?.message ?? 'Kiosk information could not be loaded.')
    }

    setProfile(profileResult.data as Profile | null)
    setChildren((childrenResult.data ?? []) as Child[])
    setCalendarEvents((calendarResult.data ?? []) as PublicCalendarEvent[])
    setBirthdays((birthdaysResult.data ?? []) as PublicBirthday[])

    const visits = (visitsResult.data ?? []) as AttendanceVisit[]
    const nextRecords: Record<number, KioskRecord> = {}
    let visitors = 0

    visits.forEach((visit) => {
      if (visit.participant_type === 'child' && visit.child_id != null) {
        nextRecords[visit.child_id] = {
          visitId: visit.id,
          time: formatTime(visit.signed_in_at),
        }
      } else {
        visitors += 1
      }
    })

    setRecords(nextRecords)
    setCommunityCount(visitors)
    setLoading(false)
  }

  const visibleChildren = useMemo(() => {
    const query = search.trim().toLowerCase()
    const sorted = [...children].sort((a, b) => {
      const aDone = Boolean(records[a.id])
      const bDone = Boolean(records[b.id])
      if (aDone !== bDone) return aDone ? 1 : -1
      return childName(a).localeCompare(childName(b))
    })

    if (!query) return sorted
    return sorted.filter((child) => childName(child).toLowerCase().includes(query))
  }, [children, records, search])

  const featuredEvent = useMemo(() => calendarEvents.find((event) => event.status === 'scheduled' && ['activity', 'field_trip', 'club', 'program', 'special_event'].includes(event.event_type)) ?? null, [calendarEvents])
  const todaysBirthdays = useMemo(() => {
    const now = new Date()
    return birthdays
      .filter((birthday) => birthday.birth_month === now.getMonth() + 1 && birthday.birth_day === now.getDate())
      .sort((a, b) => a.first_name.localeCompare(b.first_name))
  }, [birthdays])

  function showCelebration(title: string, subtitle: string, emoji: string) {
    setCelebration({ title, subtitle, emoji })
    window.setTimeout(() => setCelebration(null), 1500)
  }

  async function chooseMood(mood: Mood) {
    if (!selectedChild || saving) return
    const child = selectedChild
    const detail = moods.find((item) => item.value === mood) ?? moods[1]

    setSaving(true)
    setMessage('')

    const { data, error } = await supabase.rpc('sign_in_child', {
      p_child_id: child.id,
      p_mood: mood,
      p_service_date: today,
      p_source: 'kiosk',
    })

    if (error) {
      setMessage(error.message)
      setSaving(false)
      return
    }

    const result = ((data ?? []) as SignInResult[])[0]
    if (result) {
      setRecords((current) => ({
        ...current,
        [child.id]: {
          visitId: result.visit_id,
          time: formatTime(result.signed_in_at),
        },
      }))
    } else {
      await loadKioskData()
    }

    setSelectedChild(null)
    setSearch('')
    setSaving(false)
    showCelebration(`You’re signed in, ${child.first_name}!`, 'Have a great day at the center.', detail.emoji)
    window.setTimeout(() => setView('home'), 1550)
  }

  async function submitCommunitySignIn() {
    const name = visitorName.trim()
    if (!name || saving) return

    setSaving(true)
    setMessage('')

    const { error } = await supabase.rpc('sign_in_visitor', {
      p_name: name,
      p_visitor_type: visitorType,
      p_purpose: purpose,
      p_service_date: today,
      p_source: 'kiosk',
    })

    if (error) {
      setMessage(error.message)
      setSaving(false)
      return
    }

    setCommunityCount((current) => current + 1)
    setVisitorName('')
    setVisitorType('Adult')
    setPurpose(purposes[0])
    setSaving(false)
    showCelebration(`Thanks for signing in, ${name}!`, 'We’re glad you’re here.', '👋')
    window.setTimeout(() => setView('home'), 1550)
  }

  function beginStaffHold() {
    if (holdTimer.current) window.clearTimeout(holdTimer.current)
    holdTimer.current = window.setTimeout(() => {
      setUnlockOpen(true)
      setUnlockPassword('')
      setUnlockError('')
    }, 3000)
  }

  function cancelStaffHold() {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
  }

  async function unlockStaffExit() {
    const email = session?.user.email
    if (!email || !unlockPassword || unlocking) return

    setUnlocking(true)
    setUnlockError('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: unlockPassword,
    })

    if (error) {
      setUnlockError('That password did not match the staff account that launched this kiosk.')
      setUnlockPassword('')
      setUnlocking(false)
      return
    }

    allowNavigation.current = true
    setUnlockOpen(false)
    setUnlocking(false)
    router.replace('/')
  }

  if (loading) {
    return <main className="kiosk-shell"><div className="kiosk-loading">Loading sign-in…</div></main>
  }

  if (!session || !profile?.active) {
    return (
      <main className="kiosk-shell">
        <section className="kiosk-locked-card">
          <span className="kiosk-logo">JH</span>
          <h1>Kiosk unavailable</h1>
          <p>An active staff account must launch Juanita Sign-In.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="kiosk-shell">
      <div className="kiosk-preview-ribbon">Live sign-in • records save automatically</div>

      <header className="kiosk-header kiosk-public-header">
        <button
          type="button"
          className="kiosk-brand kiosk-brand-button"
          onPointerDown={beginStaffHold}
          onPointerUp={cancelStaffHold}
          onPointerLeave={cancelStaffHold}
          onPointerCancel={cancelStaffHold}
          onContextMenu={(event) => event.preventDefault()}
          aria-label="Juanita Hub kiosk"
        >
          <span className="kiosk-logo">JH</span>
          <span><strong>Juanita Sign-In</strong><small>{formatToday()}</small></span>
        </button>

        {view !== 'home' && (
          <button type="button" className="kiosk-home-button" onClick={() => {
            setView('home')
            setSelectedChild(null)
            setSearch('')
            setMessage('')
          }}>
            ← Welcome board
          </button>
        )}
      </header>

      {message && <div className="kiosk-live-error" role="alert">{message}</div>}

      {view === 'home' && (
        <section className="kiosk-board">
          <section className="kiosk-board-hero">
            <div>
              <span className="kiosk-board-eyebrow">Today at Juanita</span>
              <h1>Welcome to the center!</h1>
              <p>Sign in when you arrive, then take a look at what’s happening today.</p>
            </div>
            <div className="kiosk-board-date"><strong>{formatToday()}</strong><small>Center welcome board</small></div>
          </section>

          <section className="kiosk-checkin-choices" aria-label="Choose sign-in type">
            <button type="button" className="kiosk-choice child" onClick={() => { setView('children'); setMessage('') }}>
              <span className="kiosk-choice-icon">🧒</span>
              <span><strong>Child Sign-In</strong><small>Find your name and tell us how you feel today</small></span>
              <span className="kiosk-choice-arrow">→</span>
            </button>
            <button type="button" className="kiosk-choice community" onClick={() => { setView('community'); setMessage('') }}>
              <span className="kiosk-choice-icon">👋</span>
              <span><strong>Adult / Visitor Sign-In</strong><small>Sign in for programs, computer use, printing, and more</small></span>
              <span className="kiosk-choice-arrow">→</span>
            </button>
          </section>

          <section className="kiosk-board-grid">
            <article className="kiosk-board-card announcements">
              <div className="kiosk-board-card-heading"><span>📌</span><div><small>Bulletin board</small><h2>Announcements</h2></div><span className="kiosk-preview-chip">Preview</span></div>
              <div className="kiosk-board-list">
                <div><strong>Welcome!</strong><p>Sign in when you arrive so we can keep accurate daily attendance.</p></div>
                <div><strong>Example activity</strong><p>Announcements will become their own editable module after the calendar.</p></div>
                <div><strong>Community services</strong><p>Computer, printing, faxing, and forms assistance available during center hours.</p></div>
              </div>
            </article>

            <article className="kiosk-board-card birthdays">
              <div className="kiosk-board-card-heading"><span>🎂</span><div><small>Celebrate</small><h2>Birthdays</h2></div><span className="kiosk-preview-chip">Profiles</span></div>
              {todaysBirthdays.length === 0 ? (
                <div className="kiosk-birthday-empty"><span>🎈</span><strong>No birthdays today</strong><p>Public birthday celebrations from current child registrations will appear here automatically.</p></div>
              ) : (
                <div className="kiosk-board-list">
                  {todaysBirthdays.map((birthday) => <div key={birthday.child_id}><strong>🎉 Happy Birthday, {birthday.first_name}!</strong><p>We hope you have an awesome day at Juanita!</p></div>)}
                </div>
              )}
            </article>

            <article className="kiosk-board-card schedule">
              <div className="kiosk-board-card-heading"><span>🗓️</span><div><small>Today</small><h2>Schedule</h2></div><span className="kiosk-preview-chip">Calendar</span></div>
              <div className="kiosk-board-schedule">
                {calendarEvents.length === 0 && <div><time>—</time><span><strong>No public events planned yet</strong><small>Check back for center updates.</small></span></div>}
                {calendarEvents.map((event) => (
                  <div key={event.id}>
                    <time>{calendarTimeLabel(event)}</time>
                    <span>
                      <strong>{calendarIcon(event.event_type)} {event.status === 'canceled' ? `Canceled: ${event.title}` : event.title}</strong>
                      <small>{event.location || event.description || 'Juanita center event'}</small>
                    </span>
                  </div>
                ))}
              </div>
            </article>

            <article className="kiosk-board-card today-activity">
              <div className="kiosk-board-card-heading"><span>✨</span><div><small>Featured</small><h2>Today’s Activity</h2></div><span className="kiosk-preview-chip">Calendar</span></div>
              <div className="kiosk-featured-activity">
                {featuredEvent ? (
                  <>
                    <span className="kiosk-featured-icon">{calendarIcon(featuredEvent.event_type)}</span>
                    <div><strong>{featuredEvent.title}</strong><p>{featuredEvent.description || [calendarTimeLabel(featuredEvent), featuredEvent.location].filter(Boolean).join(' • ') || 'See today’s schedule for details.'}</p></div>
                  </>
                ) : (
                  <>
                    <span className="kiosk-featured-icon">📅</span>
                    <div><strong>No featured activity yet</strong><p>Today’s public activities will appear here automatically from the center calendar.</p></div>
                  </>
                )}
              </div>
            </article>
          </section>
        </section>
      )}

      {view === 'children' && (
        <section className="kiosk-content">
          <div className="kiosk-intro">
            <span className="kiosk-step">1</span>
            <div><h1>Find your name</h1><p>Tap your card, then tell us how you’re feeling today.</p></div>
          </div>

          <label className="kiosk-search">
            <span className="sr-only">Search your name</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your name…" />
          </label>

          <div className="kiosk-name-grid">
            {visibleChildren.map((child) => {
              const record = records[child.id]

              return (
                <button
                  type="button"
                  key={child.id}
                  className={`kiosk-name-card ${record ? 'done' : ''}`}
                  onClick={() => !record && setSelectedChild(child)}
                  disabled={Boolean(record) || saving}
                >
                  <span className="kiosk-avatar">{child.first_name.charAt(0).toUpperCase()}</span>
                  <span className="kiosk-name-text"><strong>{childName(child)}</strong>{record ? <small>✓ Signed in at {record.time}</small> : <small>Tap to sign in</small>}</span>
                  {record && <span className="kiosk-check">✓</span>}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {view === 'community' && (
        <section className="kiosk-community-content">
          <div className="kiosk-intro">
            <span className="kiosk-step">1</span>
            <div><h1>Adult / Visitor Sign-In</h1><p>Tell us who you are and what brings you to the center today.</p></div>
          </div>

          <section className="kiosk-community-form-card">
            <label className="kiosk-form-field wide">
              <span>Name or identifier</span>
              <input value={visitorName} onChange={(event) => setVisitorName(event.target.value)} placeholder="Your name" autoComplete="off" disabled={saving} />
            </label>

            <div className="kiosk-community-form-grid">
              <label className="kiosk-form-field">
                <span>Visitor type</span>
                <select value={visitorType} onChange={(event) => setVisitorType(event.target.value as VisitorType)} disabled={saving}>
                  <option>Adult</option>
                  <option>Family</option>
                  <option>Visitor</option>
                </select>
              </label>
              <label className="kiosk-form-field">
                <span>Reason for visit</span>
                <select value={purpose} onChange={(event) => setPurpose(event.target.value)} disabled={saving}>
                  {purposes.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
            </div>

            <button type="button" className="kiosk-community-submit" onClick={submitCommunitySignIn} disabled={!visitorName.trim() || saving}>
              {saving ? 'Saving…' : 'Sign in'}
            </button>
          </section>

          <div className="kiosk-community-session-note">
            <span>✓</span>
            <p><strong>{communityCount} adult / visitor sign-in{communityCount === 1 ? '' : 's'} recorded today.</strong> Each sign-in is saved immediately for monthly totals and averages.</p>
          </div>
        </section>
      )}

      {selectedChild && (
        <div className="kiosk-mood-backdrop" role="dialog" aria-modal="true" aria-labelledby="kiosk-mood-title">
          <section className="kiosk-mood-card">
            <button type="button" className="kiosk-close" onClick={() => !saving && setSelectedChild(null)} aria-label="Go back">×</button>
            <span className="kiosk-step">2</span>
            <h2 id="kiosk-mood-title">Hi, {selectedChild.first_name}!</h2>
            <p>How are you feeling today?</p>
            <div className="kiosk-moods">
              {moods.map((mood) => (
                <button type="button" key={mood.value} className={`kiosk-mood ${mood.value}`} onClick={() => chooseMood(mood.value)} disabled={saving}>
                  <span>{mood.emoji}</span>
                  <strong>{saving ? 'Saving…' : mood.label}</strong>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {celebration && (
        <div className="kiosk-celebration" aria-live="polite">
          <div className="kiosk-celebration-card">
            <div className="kiosk-confetti" aria-hidden="true"><span>✦</span><span>●</span><span>◆</span><span>★</span><span>✦</span></div>
            <span className="kiosk-celebration-emoji">{celebration.emoji}</span>
            <h2>{celebration.title}</h2>
            <p>{celebration.subtitle}</p>
          </div>
        </div>
      )}

      {unlockOpen && (
        <div className="kiosk-staff-unlock-backdrop" role="dialog" aria-modal="true" aria-labelledby="kiosk-staff-unlock-title">
          <section className="kiosk-staff-unlock-card">
            <button type="button" className="kiosk-close" onClick={() => !unlocking && setUnlockOpen(false)} aria-label="Close staff unlock">×</button>
            <span className="kiosk-lock-icon">🔒</span>
            <h2 id="kiosk-staff-unlock-title">Staff exit</h2>
            <p>Enter the password for the staff account that launched this kiosk.</p>
            <input
              type="password"
              value={unlockPassword}
              onChange={(event) => setUnlockPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void unlockStaffExit()
              }}
              placeholder="Staff password"
              autoComplete="current-password"
              autoFocus
              disabled={unlocking}
            />
            {unlockError && <div className="kiosk-unlock-error">{unlockError}</div>}
            <button type="button" className="kiosk-unlock-submit" onClick={() => void unlockStaffExit()} disabled={!unlockPassword || unlocking}>
              {unlocking ? 'Verifying…' : 'Exit to staff dashboard'}
            </button>
            <small>Press and hold the JH logo for 3 seconds whenever staff need to leave Kiosk Mode.</small>
          </section>
        </div>
      )}
    </main>
  )
}
