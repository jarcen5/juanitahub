'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Profile = {
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

type Mood = 'happy' | 'meh' | 'sad'

type ChildAttendance = {
  checkIn: string
  mood: Mood
}

type CommunityVisit = {
  id: string
  name: string
  group: 'Adult' | 'Family' | 'Visitor'
  purpose: string
  checkIn: string
  checkOut: string | null
}

type AttendanceTab = 'children' | 'community'

const purposes = [
  'Program / Activity',
  'Computer use',
  'Printing / Faxing',
  'Forms / Assistance',
  'Meeting / Event',
  'Other',
]

const moods: Array<{ value: Mood; emoji: string; label: string; helper: string }> = [
  { value: 'happy', emoji: '😀', label: 'Good', helper: 'I feel good today' },
  { value: 'meh', emoji: '😐', label: 'Meh', helper: 'I feel just okay' },
  { value: 'sad', emoji: '🙁', label: 'Not great', helper: 'I am having a hard day' },
]

function childName(child: Child) {
  return `${child.first_name}${child.last_name ? ` ${child.last_name}` : ''}`
}

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function localDateKey() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

function moodDetails(mood: Mood) {
  return moods.find((item) => item.value === mood) ?? moods[1]
}

export default function AttendancePrototypePage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [children, setChildren] = useState<Child[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [tab, setTab] = useState<AttendanceTab>('children')
  const [attendanceDate, setAttendanceDate] = useState(localDateKey())
  const [search, setSearch] = useState('')
  const [childAttendance, setChildAttendance] = useState<Record<number, ChildAttendance>>({})
  const [selectedChild, setSelectedChild] = useState<Child | null>(null)
  const [celebration, setCelebration] = useState<{ firstName: string; mood: Mood } | null>(null)
  const [communityVisits, setCommunityVisits] = useState<CommunityVisit[]>([])
  const [communityName, setCommunityName] = useState('')
  const [communityGroup, setCommunityGroup] = useState<CommunityVisit['group']>('Adult')
  const [communityPurpose, setCommunityPurpose] = useState(purposes[0])

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
    if (!session) return
    void loadData()
  }, [session])

  async function loadData() {
    if (!session) return
    setLoading(true)

    const [profileResult, childrenResult] = await Promise.all([
      supabase
        .from('staff_profiles')
        .select('display_name, role, active')
        .eq('user_id', session.user.id)
        .maybeSingle(),
      supabase
        .from('children')
        .select('id, first_name, last_name, active')
        .eq('active', true)
        .order('first_name')
        .order('last_name'),
    ])

    if (profileResult.error || childrenResult.error) {
      setMessage(profileResult.error?.message ?? childrenResult.error?.message ?? 'Attendance could not be loaded.')
    }

    setProfile(profileResult.data as Profile | null)
    setChildren((childrenResult.data ?? []) as Child[])
    setLoading(false)
  }

  const filteredChildren = useMemo(() => {
    const query = search.trim().toLowerCase()
    const matches = query
      ? children.filter((child) => childName(child).toLowerCase().includes(query))
      : children

    return [...matches].sort((a, b) => {
      const aDone = childAttendance[a.id] ? 1 : 0
      const bDone = childAttendance[b.id] ? 1 : 0
      if (aDone !== bDone) return aDone - bDone
      return childName(a).localeCompare(childName(b))
    })
  }, [children, search, childAttendance])

  const childCheckedIn = useMemo(
    () => Object.keys(childAttendance).length,
    [childAttendance],
  )

  const communityCheckedIn = communityVisits.length
  const communityPresentNow = communityVisits.filter((visit) => !visit.checkOut).length
  const totalVisits = childCheckedIn + communityCheckedIn
  const presentNow = childCheckedIn + communityPresentNow

  function startChildCheckIn(child: Child) {
    const record = childAttendance[child.id]
    if (record) {
      setMessage(`${childName(child)} is already checked in for this prototype session.`)
      return
    }

    setMessage('')
    setSelectedChild(child)
  }

  function finishChildCheckIn(mood: Mood) {
    if (!selectedChild) return

    const child = selectedChild
    setChildAttendance((current) => ({
      ...current,
      [child.id]: {
        checkIn: timeNow(),
        mood,
      },
    }))
    setSelectedChild(null)
    setCelebration({ firstName: child.first_name, mood })
    setMessage('')

    window.setTimeout(() => setCelebration(null), 1500)
  }

  function addCommunityVisit() {
    const name = communityName.trim()
    if (!name) {
      setMessage('Enter a name or identifier for the community visitor first.')
      return
    }

    setCommunityVisits((current) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name,
        group: communityGroup,
        purpose: communityPurpose,
        checkIn: timeNow(),
        checkOut: null,
      },
      ...current,
    ])
    setCommunityName('')
    setMessage('')
  }

  function toggleCommunityCheckout(id: string) {
    setCommunityVisits((current) => current.map((visit) => (
      visit.id === id
        ? { ...visit, checkOut: visit.checkOut ? null : timeNow() }
        : visit
    )))
  }

  function resetPrototype() {
    if (!window.confirm('Clear all prototype attendance from this browser session? Nothing has been saved to Juanita Hub.')) return
    setChildAttendance({})
    setCommunityVisits([])
    setSearch('')
    setSelectedChild(null)
    setCelebration(null)
    setMessage('Prototype attendance cleared.')
  }

  if (loading && !session) {
    return <main className="login-wrap"><div className="card login-card">Loading Attendance prototype…</div></main>
  }

  if (!session) {
    return (
      <main className="login-wrap">
        <section className="card login-card">
          <h1>Attendance</h1>
          <p className="subtle">Sign in through Juanita Hub before testing attendance.</p>
        </section>
      </main>
    )
  }

  if (!profile?.active) {
    return (
      <main className="login-wrap">
        <section className="card login-card">
          <h1>Attendance</h1>
          <div className="notice">Your staff account must be active before attendance is available.</div>
        </section>
      </main>
    )
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          Juanita Hub
          <small>Attendance prototype</small>
        </div>
        <div className="toolbar">
          <span>{profile.display_name} <span className="badge">{profile.role}</span></span>
        </div>
      </header>

      <main className="main attendance-page">
        <section className="hero attendance-hero">
          <div>
            <span className="attendance-eyebrow">Prototype • Nothing is saved yet</span>
            <h1>Daily Attendance & Check-In</h1>
            <p className="subtle">A simple daily routine for youth check-in, feelings, and community attendance—designed for the tablet and staff phones.</p>
          </div>
          <label className="field attendance-date-field">
            <span>Prototype date</span>
            <input type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} />
          </label>
        </section>

        <div className="notice attendance-safety-notice">
          <strong>Safe prototype:</strong> child names are read from the existing roster, but every check-in below lives only in this browser session. No attendance or mood records are written to Supabase yet.
        </div>

        {message && <div className="notice">{message}</div>}

        <section className="grid attendance-stats">
          <div className="card stat"><span className="subtle">Here now</span><strong>{presentNow}</strong></div>
          <div className="card stat"><span className="subtle">Total visits today</span><strong>{totalVisits}</strong></div>
          <div className="card stat"><span className="subtle">Children checked in</span><strong>{childCheckedIn}/{children.length}</strong></div>
          <div className="card stat"><span className="subtle">Community visits</span><strong>{communityCheckedIn}</strong></div>
        </section>

        <section className="card attendance-workspace">
          <div className="attendance-tabs" role="tablist" aria-label="Attendance type">
            <button
              type="button"
              className={tab === 'children' ? 'active' : ''}
              onClick={() => setTab('children')}
            >
              Youth Check-In
              <span>{childCheckedIn} checked in</span>
            </button>
            <button
              type="button"
              className={tab === 'community' ? 'active' : ''}
              onClick={() => setTab('community')}
            >
              Community
              <span>{communityPresentNow} here now</span>
            </button>
          </div>

          {tab === 'children' ? (
            <div className="attendance-panel">
              <div className="attendance-kiosk-intro">
                <div className="attendance-kiosk-steps" aria-label="Youth check-in steps">
                  <span><strong>1</strong> Find your name</span>
                  <span><strong>2</strong> Tap your card</span>
                  <span><strong>3</strong> Tell us how you feel</span>
                </div>
                <label className="attendance-search">
                  <span className="sr-only">Search children</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search your name…"
                  />
                </label>
              </div>

              <div className="attendance-roster">
                {filteredChildren.map((child) => {
                  const record = childAttendance[child.id]
                  const mood = record ? moodDetails(record.mood) : null

                  return (
                    <button
                      type="button"
                      key={child.id}
                      className={`attendance-person ${record ? 'present' : ''}`}
                      onClick={() => startChildCheckIn(child)}
                    >
                      <span className="attendance-person-name">{childName(child)}</span>
                      <span className="attendance-person-status">
                        {!record && 'Tap your name to check in'}
                        {record && `${mood?.emoji} Checked in at ${record.checkIn}`}
                      </span>
                      <span className="attendance-person-action">
                        {!record ? 'Check in' : 'Done ✓'}
                      </span>
                    </button>
                  )
                })}

                {filteredChildren.length === 0 && (
                  <div className="empty">No children match that search.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="attendance-panel">
              <div className="section-heading attendance-section-heading">
                <div>
                  <h2>Community check-in</h2>
                  <p className="subtle">Adults, families, and other visitors can be counted alongside youth attendance for monthly reporting.</p>
                </div>
              </div>

              <div className="attendance-community-layout">
                <section className="attendance-checkin-form">
                  <div className="field">
                    <label>Name or identifier</label>
                    <input
                      value={communityName}
                      onChange={(event) => setCommunityName(event.target.value)}
                      placeholder="Example: Maria S."
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') addCommunityVisit()
                      }}
                    />
                  </div>

                  <div className="attendance-form-grid">
                    <div className="field">
                      <label>Visitor type</label>
                      <select value={communityGroup} onChange={(event) => setCommunityGroup(event.target.value as CommunityVisit['group'])}>
                        <option>Adult</option>
                        <option>Family</option>
                        <option>Visitor</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Reason for visit</label>
                      <select value={communityPurpose} onChange={(event) => setCommunityPurpose(event.target.value)}>
                        {purposes.map((purpose) => <option key={purpose}>{purpose}</option>)}
                      </select>
                    </div>
                  </div>

                  <button type="button" className="primary attendance-big-button" onClick={addCommunityVisit}>
                    Check in visitor
                  </button>
                </section>

                <section>
                  <h3>Today's community visits</h3>
                  <div className="attendance-community-list">
                    {communityVisits.length === 0 && <div className="empty">No community visitors checked in during this prototype session.</div>}
                    {communityVisits.map((visit) => (
                      <button
                        type="button"
                        className={`attendance-community-row ${visit.checkOut ? 'checked-out' : ''}`}
                        key={visit.id}
                        onClick={() => toggleCommunityCheckout(visit.id)}
                      >
                        <span>
                          <strong>{visit.name}</strong>
                          <small>{visit.group} • {visit.purpose}</small>
                        </span>
                        <span>
                          <strong>{visit.checkOut ? 'Checked out' : 'Here now'}</strong>
                          <small>{visit.checkOut ? `${visit.checkIn}–${visit.checkOut}` : `Since ${visit.checkIn}`}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          )}
        </section>

        <section className="card attendance-record-plan">
          <div>
            <span className="attendance-eyebrow">Next production step</span>
            <h2>Attendance should save itself</h2>
            <p className="subtle">In the permanent version, every completed check-in will be saved to Juanita Hub immediately. Monthly child and adult totals and averages can then be calculated automatically—no one needs to re-enter or total a year of attendance in Google Sheets.</p>
          </div>
          <div className="attendance-record-points">
            <span><strong>Instant</strong> database record</span>
            <span><strong>Automatic</strong> monthly averages</span>
            <span><strong>Optional</strong> spreadsheet export</span>
          </div>
        </section>

        <section className="card attendance-next-step">
          <div>
            <h2>What we are testing</h2>
            <p className="subtle">Try the youth routine on the Android tablet and a phone. We want the three-step check-in to be memorable enough for children to do every day and fast enough that staff can immediately see who has not checked in.</p>
          </div>
          <button type="button" className="ghost danger-button" onClick={resetPrototype}>Clear prototype session</button>
        </section>
      </main>

      {selectedChild && (
        <div className="attendance-mood-backdrop" role="presentation" onClick={() => setSelectedChild(null)}>
          <section
            className="attendance-mood-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-mood-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="attendance-mood-close" aria-label="Cancel check-in" onClick={() => setSelectedChild(null)}>×</button>
            <span className="attendance-mood-name">Hi, {selectedChild.first_name}!</span>
            <h2 id="attendance-mood-title">How are you feeling today?</h2>
            <p className="subtle">Pick the face that feels most like you right now.</p>
            <div className="attendance-mood-grid">
              {moods.map((mood) => (
                <button type="button" key={mood.value} className={`attendance-mood-option ${mood.value}`} onClick={() => finishChildCheckIn(mood.value)}>
                  <span className="attendance-mood-emoji" aria-hidden="true">{mood.emoji}</span>
                  <strong>{mood.label}</strong>
                  <small>{mood.helper}</small>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {celebration && (
        <div className="attendance-celebration" role="status" aria-live="polite">
          <div className="attendance-celebration-card">
            <div className="attendance-celebration-sparkles" aria-hidden="true">
              <span>●</span><span>★</span><span>●</span><span>★</span><span>●</span>
            </div>
            <span className="attendance-celebration-emoji" aria-hidden="true">{moodDetails(celebration.mood).emoji}</span>
            <h2>You're checked in, {celebration.firstName}!</h2>
            <p>Thanks for telling us how you're feeling. ✨</p>
          </div>
        </div>
      )}
    </div>
  )
}
