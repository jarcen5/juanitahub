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

type ChildAttendance = {
  checkIn: string | null
  checkOut: string | null
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
    if (!query) return children
    return children.filter((child) => childName(child).toLowerCase().includes(query))
  }, [children, search])

  const childCheckedIn = useMemo(
    () => Object.values(childAttendance).filter((record) => record.checkIn).length,
    [childAttendance],
  )

  const childPresentNow = useMemo(
    () => Object.values(childAttendance).filter((record) => record.checkIn && !record.checkOut).length,
    [childAttendance],
  )

  const communityCheckedIn = communityVisits.length
  const communityPresentNow = communityVisits.filter((visit) => !visit.checkOut).length
  const totalVisits = childCheckedIn + communityCheckedIn
  const presentNow = childPresentNow + communityPresentNow

  function toggleChild(childId: number) {
    setChildAttendance((current) => {
      const record = current[childId]

      if (!record?.checkIn) {
        return {
          ...current,
          [childId]: { checkIn: timeNow(), checkOut: null },
        }
      }

      if (!record.checkOut) {
        return {
          ...current,
          [childId]: { ...record, checkOut: timeNow() },
        }
      }

      return {
        ...current,
        [childId]: { checkIn: timeNow(), checkOut: null },
      }
    })
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
            <h1>Daily Attendance</h1>
            <p className="subtle">Test the check-in workflow on a phone or tablet before we connect attendance to permanent records.</p>
          </div>
          <label className="field attendance-date-field">
            <span>Attendance date</span>
            <input type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} />
          </label>
        </section>

        <div className="notice attendance-safety-notice">
          <strong>Safe prototype:</strong> child names are read from the existing roster, but every check-in below lives only in this browser session. Refreshing or clearing the prototype removes it. No attendance records are written to Supabase.
        </div>

        {message && <div className="notice">{message}</div>}

        <section className="grid attendance-stats">
          <div className="card stat"><span className="subtle">Present now</span><strong>{presentNow}</strong></div>
          <div className="card stat"><span className="subtle">Total visits today</span><strong>{totalVisits}</strong></div>
          <div className="card stat"><span className="subtle">Children checked in</span><strong>{childCheckedIn}</strong></div>
          <div className="card stat"><span className="subtle">Community visits</span><strong>{communityCheckedIn}</strong></div>
        </section>

        <section className="card attendance-workspace">
          <div className="attendance-tabs" role="tablist" aria-label="Attendance type">
            <button
              type="button"
              className={tab === 'children' ? 'active' : ''}
              onClick={() => setTab('children')}
            >
              Children
              <span>{childPresentNow} here now</span>
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
              <div className="section-heading attendance-section-heading">
                <div>
                  <h2>Child check-in</h2>
                  <p className="subtle">Tap once to check in, then tap again when the child leaves.</p>
                </div>
                <label className="attendance-search">
                  <span className="sr-only">Search children</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search child…"
                  />
                </label>
              </div>

              <div className="attendance-roster">
                {filteredChildren.map((child) => {
                  const record = childAttendance[child.id]
                  const currentlyHere = Boolean(record?.checkIn && !record?.checkOut)
                  const visited = Boolean(record?.checkIn)

                  return (
                    <button
                      type="button"
                      key={child.id}
                      className={`attendance-person ${currentlyHere ? 'present' : visited ? 'checked-out' : ''}`}
                      onClick={() => toggleChild(child.id)}
                    >
                      <span className="attendance-person-name">{childName(child)}</span>
                      <span className="attendance-person-status">
                        {!visited && 'Tap to check in'}
                        {currentlyHere && `Checked in ${record?.checkIn}`}
                        {visited && !currentlyHere && `Left ${record?.checkOut} • tap to check in again`}
                      </span>
                      <span className="attendance-person-action">
                        {!visited ? 'Check in' : currentlyHere ? 'Check out' : 'Check in'}
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
                  <p className="subtle">Prototype how adults, families, and other visitors could be counted alongside youth attendance.</p>
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

        <section className="card attendance-next-step">
          <div>
            <h2>What we are testing</h2>
            <p className="subtle">Before permanent attendance is built, try this on the Android tablet and your phones. The goal is to learn whether the tap sizes, child search, visitor check-in, and check-out flow feel fast enough during a real workday.</p>
          </div>
          <button type="button" className="ghost danger-button" onClick={resetPrototype}>Clear prototype session</button>
        </section>
      </main>
    </div>
  )
}
