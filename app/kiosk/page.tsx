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

type Mood = 'happy' | 'meh' | 'sad'
type KioskView = 'home' | 'children' | 'community'
type VisitorType = 'Adult' | 'Family' | 'Visitor'

type KioskRecord = {
  mood: Mood
  time: string
}

type CommunityRecord = {
  id: string
  name: string
  visitorType: VisitorType
  purpose: string
  time: string
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

const PREVIEW_EXIT_PIN = '2468'

function childName(child: Child) {
  return `${child.first_name}${child.last_name ? ` ${child.last_name}` : ''}`
}

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatToday() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export default function KioskPreviewPage() {
  const router = useRouter()
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [children, setChildren] = useState<Child[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<KioskView>('home')
  const [search, setSearch] = useState('')
  const [selectedChild, setSelectedChild] = useState<Child | null>(null)
  const [records, setRecords] = useState<Record<number, KioskRecord>>({})
  const [communityRecords, setCommunityRecords] = useState<CommunityRecord[]>([])
  const [visitorName, setVisitorName] = useState('')
  const [visitorType, setVisitorType] = useState<VisitorType>('Adult')
  const [purpose, setPurpose] = useState(purposes[0])
  const [celebration, setCelebration] = useState<{ title: string; subtitle: string; emoji: string } | null>(null)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [unlockPin, setUnlockPin] = useState('')
  const [unlockError, setUnlockError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!session) return

    supabase
      .from('children')
      .select('id, first_name, last_name')
      .eq('active', true)
      .order('first_name')
      .order('last_name')
      .then(({ data }) => {
        setChildren((data ?? []) as Child[])
        setLoading(false)
      })
  }, [session])

  useEffect(() => () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current)
  }, [])

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

  function showCelebration(title: string, subtitle: string, emoji: string) {
    setCelebration({ title, subtitle, emoji })
    window.setTimeout(() => setCelebration(null), 1500)
  }

  function chooseMood(mood: Mood) {
    if (!selectedChild) return
    const detail = moods.find((item) => item.value === mood) ?? moods[1]

    setRecords((current) => ({
      ...current,
      [selectedChild.id]: { mood, time: timeNow() },
    }))

    showCelebration(`You’re checked in, ${selectedChild.first_name}!`, 'Have a great day at the center.', detail.emoji)
    setSelectedChild(null)
    setSearch('')

    window.setTimeout(() => setView('home'), 1550)
  }

  function submitCommunityCheckIn() {
    const name = visitorName.trim()
    if (!name) return

    setCommunityRecords((current) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name,
        visitorType,
        purpose,
        time: timeNow(),
      },
      ...current,
    ])

    showCelebration(`Thanks for checking in, ${name}!`, 'We’re glad you’re here.', '👋')
    setVisitorName('')
    setVisitorType('Adult')
    setPurpose(purposes[0])

    window.setTimeout(() => setView('home'), 1550)
  }

  function beginStaffHold() {
    if (holdTimer.current) window.clearTimeout(holdTimer.current)
    holdTimer.current = window.setTimeout(() => {
      setUnlockOpen(true)
      setUnlockPin('')
      setUnlockError('')
    }, 3000)
  }

  function cancelStaffHold() {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
  }

  function unlockStaffExit() {
    if (unlockPin === PREVIEW_EXIT_PIN) {
      setUnlockOpen(false)
      setUnlockError('')
      router.push('/')
      return
    }

    setUnlockError('That PIN is not correct.')
    setUnlockPin('')
  }

  if (loading) {
    return <main className="kiosk-shell"><div className="kiosk-loading">Loading check-in…</div></main>
  }

  if (!session) {
    return (
      <main className="kiosk-shell">
        <section className="kiosk-locked-card">
          <span className="kiosk-logo">JH</span>
          <h1>Kiosk Preview</h1>
          <p>A staff session is required to launch this prototype.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="kiosk-shell">
      <div className="kiosk-preview-ribbon">Preview only • nothing is saved</div>

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
          <span><strong>Juanita Check-In</strong><small>{formatToday()}</small></span>
        </button>

        {view !== 'home' && (
          <button type="button" className="kiosk-home-button" onClick={() => {
            setView('home')
            setSelectedChild(null)
            setSearch('')
          }}>
            ← Welcome board
          </button>
        )}
      </header>

      {view === 'home' && (
        <section className="kiosk-board">
          <section className="kiosk-board-hero">
            <div>
              <span className="kiosk-board-eyebrow">Today at Juanita</span>
              <h1>Welcome to the center!</h1>
              <p>Check in when you arrive, then take a look at what’s happening today.</p>
            </div>
            <div className="kiosk-board-date"><strong>{formatToday()}</strong><small>Center welcome board</small></div>
          </section>

          <section className="kiosk-checkin-choices" aria-label="Choose check-in type">
            <button type="button" className="kiosk-choice child" onClick={() => setView('children')}>
              <span className="kiosk-choice-icon">🧒</span>
              <span><strong>Child Check-In</strong><small>Find your name and tell us how you feel today</small></span>
              <span className="kiosk-choice-arrow">→</span>
            </button>
            <button type="button" className="kiosk-choice community" onClick={() => setView('community')}>
              <span className="kiosk-choice-icon">👋</span>
              <span><strong>Adult / Visitor Check-In</strong><small>Sign in for programs, computer use, printing, and more</small></span>
              <span className="kiosk-choice-arrow">→</span>
            </button>
          </section>

          <section className="kiosk-board-grid">
            <article className="kiosk-board-card announcements">
              <div className="kiosk-board-card-heading"><span>📌</span><div><small>Bulletin board</small><h2>Announcements</h2></div><span className="kiosk-preview-chip">Preview</span></div>
              <div className="kiosk-board-list">
                <div><strong>Welcome!</strong><p>Check in when you arrive so we can keep accurate daily attendance.</p></div>
                <div><strong>Example activity</strong><p>Art activity at 4:00 PM with homework support afterward.</p></div>
                <div><strong>Community services</strong><p>Computer, printing, faxing, and forms assistance available during center hours.</p></div>
              </div>
            </article>

            <article className="kiosk-board-card birthdays">
              <div className="kiosk-board-card-heading"><span>🎂</span><div><small>Celebrate</small><h2>Birthdays</h2></div><span className="kiosk-preview-chip">Preview</span></div>
              <div className="kiosk-birthday-empty">
                <span>🎈</span>
                <strong>No birthdays added for today yet</strong>
                <p>Future participant profiles can automatically show today’s birthdays here.</p>
              </div>
            </article>

            <article className="kiosk-board-card schedule">
              <div className="kiosk-board-card-heading"><span>🗓️</span><div><small>Today</small><h2>Schedule</h2></div><span className="kiosk-preview-chip">Preview</span></div>
              <div className="kiosk-board-schedule">
                <div><time>2:30 PM</time><span><strong>Afterschool arrival</strong><small>Check-in and snack</small></span></div>
                <div><time>3:30 PM</time><span><strong>Homework / quiet time</strong><small>Example schedule item</small></span></div>
                <div><time>4:30 PM</time><span><strong>Club or special activity</strong><small>Example program block</small></span></div>
                <div><time>6:00 PM</time><span><strong>Wrap-up</strong><small>Center schedule preview</small></span></div>
              </div>
            </article>

            <article className="kiosk-board-card today-activity">
              <div className="kiosk-board-card-heading"><span>✨</span><div><small>Featured</small><h2>Today’s Activity</h2></div><span className="kiosk-preview-chip">Preview</span></div>
              <div className="kiosk-featured-activity">
                <span className="kiosk-featured-icon">🎨</span>
                <div><strong>Creative Studio</strong><p>Drop in for today’s featured activity after homework time.</p></div>
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
                  disabled={Boolean(record)}
                >
                  <span className="kiosk-avatar">{child.first_name.charAt(0).toUpperCase()}</span>
                  <span className="kiosk-name-text"><strong>{childName(child)}</strong>{record ? <small>✓ Checked in at {record.time}</small> : <small>Tap to check in</small>}</span>
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
            <div><h1>Adult / Visitor Check-In</h1><p>Tell us who you are and what brings you to the center today.</p></div>
          </div>

          <section className="kiosk-community-form-card">
            <label className="kiosk-form-field wide">
              <span>Name or identifier</span>
              <input value={visitorName} onChange={(event) => setVisitorName(event.target.value)} placeholder="Your name" autoComplete="off" />
            </label>

            <div className="kiosk-community-form-grid">
              <label className="kiosk-form-field">
                <span>Visitor type</span>
                <select value={visitorType} onChange={(event) => setVisitorType(event.target.value as VisitorType)}>
                  <option>Adult</option>
                  <option>Family</option>
                  <option>Visitor</option>
                </select>
              </label>
              <label className="kiosk-form-field">
                <span>Reason for visit</span>
                <select value={purpose} onChange={(event) => setPurpose(event.target.value)}>
                  {purposes.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
            </div>

            <button type="button" className="kiosk-community-submit" onClick={submitCommunityCheckIn} disabled={!visitorName.trim()}>
              Check in
            </button>
          </section>

          <div className="kiosk-community-session-note">
            <span>✓</span>
            <p><strong>{communityRecords.length} visitor check-in{communityRecords.length === 1 ? '' : 's'} in this preview session.</strong> The permanent version will save each visit immediately so monthly totals and averages are automatic.</p>
          </div>
        </section>
      )}

      {selectedChild && (
        <div className="kiosk-mood-backdrop" role="dialog" aria-modal="true" aria-labelledby="kiosk-mood-title">
          <section className="kiosk-mood-card">
            <button type="button" className="kiosk-close" onClick={() => setSelectedChild(null)} aria-label="Go back">×</button>
            <span className="kiosk-step">2</span>
            <h2 id="kiosk-mood-title">Hi, {selectedChild.first_name}!</h2>
            <p>How are you feeling today?</p>
            <div className="kiosk-moods">
              {moods.map((mood) => (
                <button type="button" key={mood.value} className={`kiosk-mood ${mood.value}`} onClick={() => chooseMood(mood.value)}>
                  <span>{mood.emoji}</span>
                  <strong>{mood.label}</strong>
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
            <button type="button" className="kiosk-close" onClick={() => setUnlockOpen(false)} aria-label="Close staff unlock">×</button>
            <span className="kiosk-lock-icon">🔒</span>
            <h2 id="kiosk-staff-unlock-title">Staff exit</h2>
            <p>Enter the staff PIN to leave Kiosk Mode.</p>
            <input
              type="password"
              inputMode="numeric"
              value={unlockPin}
              onChange={(event) => setUnlockPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') unlockStaffExit()
              }}
              placeholder="PIN"
              autoFocus
            />
            {unlockError && <div className="kiosk-unlock-error">{unlockError}</div>}
            <button type="button" className="kiosk-unlock-submit" onClick={unlockStaffExit}>Exit to staff dashboard</button>
            <small>Preview interaction only. Production will use protected staff authorization.</small>
          </section>
        </div>
      )}
    </main>
  )
}
