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
type StoredMood = 'good' | 'okay' | 'hard_day'

type AttendanceVisit = {
  id: number
  service_date: string
  participant_type: 'child' | 'adult' | 'family' | 'visitor'
  child_id: number | null
  visitor_name: string | null
  purpose: string | null
  signed_in_at: string
  signed_out_at: string | null
  source: string
  status: 'active' | 'voided'
}

type AttendanceWellbeing = {
  visit_id: number
  mood: StoredMood
}

type OperatingDay = {
  service_date: string
  is_open: boolean
  reason: string | null
}

type AttendanceTab = 'children' | 'community'
type MoodMode = 'signin' | 'correct'

const purposes = [
  'Program / Activity',
  'Computer use',
  'Printing / Faxing',
  'Forms / Assistance',
  'Meeting / Event',
  'Other',
]

const moods: Array<{ value: Mood; stored: StoredMood; emoji: string; label: string; helper: string }> = [
  { value: 'happy', stored: 'good', emoji: '😀', label: 'Good', helper: 'I feel good today' },
  { value: 'meh', stored: 'okay', emoji: '😐', label: 'Meh', helper: 'I feel just okay' },
  { value: 'sad', stored: 'hard_day', emoji: '🙁', label: 'Not great', helper: 'I am having a hard day' },
]

function childName(child: Child) {
  return `${child.first_name}${child.last_name ? ` ${child.last_name}` : ''}`
}

function localDateKey() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

function formatTime(value: string | null) {
  if (!value) return ''
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function moodDetails(mood: StoredMood | undefined) {
  return moods.find((item) => item.stored === mood) ?? null
}

export default function AttendancePage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [children, setChildren] = useState<Child[]>([])
  const [visits, setVisits] = useState<AttendanceVisit[]>([])
  const [wellbeing, setWellbeing] = useState<Record<number, StoredMood>>({})
  const [operatingDay, setOperatingDay] = useState<OperatingDay | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [tab, setTab] = useState<AttendanceTab>('children')
  const [attendanceDate, setAttendanceDate] = useState(localDateKey())
  const [search, setSearch] = useState('')
  const [selectedChild, setSelectedChild] = useState<Child | null>(null)
  const [moodMode, setMoodMode] = useState<MoodMode>('signin')
  const [correctionVisitId, setCorrectionVisitId] = useState<number | null>(null)
  const [celebration, setCelebration] = useState<{ firstName: string; mood: Mood } | null>(null)
  const [communityName, setCommunityName] = useState('')
  const [communityGroup, setCommunityGroup] = useState<'Adult' | 'Family' | 'Visitor'>('Adult')
  const [communityPurpose, setCommunityPurpose] = useState(purposes[0])

  const today = localDateKey()

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
  }, [session, attendanceDate])

  async function loadData() {
    if (!session) return
    setLoading(true)

    const [profileResult, childrenResult, visitsResult, operatingResult] = await Promise.all([
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
      supabase
        .from('attendance_visits')
        .select('id, service_date, participant_type, child_id, visitor_name, purpose, signed_in_at, signed_out_at, source, status')
        .eq('service_date', attendanceDate)
        .eq('status', 'active')
        .order('signed_in_at', { ascending: false }),
      supabase
        .from('operating_days')
        .select('service_date, is_open, reason')
        .eq('service_date', attendanceDate)
        .maybeSingle(),
    ])

    const error = profileResult.error ?? childrenResult.error ?? visitsResult.error ?? operatingResult.error
    if (error) setMessage(error.message)

    const nextVisits = (visitsResult.data ?? []) as AttendanceVisit[]
    const childVisitIds = nextVisits
      .filter((visit) => visit.participant_type === 'child')
      .map((visit) => visit.id)

    let moodMap: Record<number, StoredMood> = {}
    if (childVisitIds.length > 0) {
      const moodResult = await supabase
        .from('attendance_wellbeing')
        .select('visit_id, mood')
        .in('visit_id', childVisitIds)

      if (moodResult.error) setMessage(moodResult.error.message)
      moodMap = Object.fromEntries(
        ((moodResult.data ?? []) as AttendanceWellbeing[]).map((row) => [row.visit_id, row.mood]),
      )
    }

    setProfile(profileResult.data as Profile | null)
    setChildren((childrenResult.data ?? []) as Child[])
    setVisits(nextVisits)
    setWellbeing(moodMap)
    setOperatingDay(operatingResult.data as OperatingDay | null)
    setLoading(false)
  }

  const childVisitByChild = useMemo(() => {
    const map = new Map<number, AttendanceVisit>()
    visits.forEach((visit) => {
      if (visit.participant_type === 'child' && visit.child_id != null) map.set(visit.child_id, visit)
    })
    return map
  }, [visits])

  const filteredChildren = useMemo(() => {
    const query = search.trim().toLowerCase()
    const matches = query
      ? children.filter((child) => childName(child).toLowerCase().includes(query))
      : children

    return [...matches].sort((a, b) => {
      const aDone = childVisitByChild.has(a.id) ? 1 : 0
      const bDone = childVisitByChild.has(b.id) ? 1 : 0
      if (aDone !== bDone) return aDone - bDone
      return childName(a).localeCompare(childName(b))
    })
  }, [children, search, childVisitByChild])

  const childSignedIn = visits.filter((visit) => visit.participant_type === 'child').length
  const communityVisits = visits.filter((visit) => visit.participant_type !== 'child')
  const communityPresentNow = communityVisits.filter((visit) => !visit.signed_out_at).length
  const totalVisits = visits.length
  const presentNow = childSignedIn + communityPresentNow

  function startChildSignIn(child: Child) {
    if (childVisitByChild.has(child.id)) return
    setMoodMode('signin')
    setCorrectionVisitId(null)
    setSelectedChild(child)
    setMessage('')
  }

  function startMoodCorrection(child: Child, visitId: number) {
    setMoodMode('correct')
    setCorrectionVisitId(visitId)
    setSelectedChild(child)
    setMessage('')
  }

  async function finishChildMood(mood: Mood) {
    if (!selectedChild || saving) return
    const child = selectedChild
    setSaving(true)
    setMessage('')

    if (moodMode === 'correct' && correctionVisitId != null) {
      const reason = window.prompt('Why are you correcting this mood selection?')?.trim()
      if (!reason) {
        setSaving(false)
        return
      }

      const { error } = await supabase.rpc('correct_child_mood', {
        p_visit_id: correctionVisitId,
        p_mood: mood,
        p_reason: reason,
      })

      if (error) {
        setMessage(error.message)
        setSaving(false)
        return
      }

      setSelectedChild(null)
      setCorrectionVisitId(null)
      setSaving(false)
      setMessage(`${child.first_name}'s mood was corrected and the change was added to the audit history.`)
      await loadData()
      return
    }

    const { error } = await supabase.rpc('sign_in_child', {
      p_child_id: child.id,
      p_mood: mood,
      p_service_date: attendanceDate,
      p_source: 'staff',
    })

    if (error) {
      setMessage(error.message)
      setSaving(false)
      return
    }

    setSelectedChild(null)
    setSaving(false)
    setCelebration({ firstName: child.first_name, mood })
    window.setTimeout(() => setCelebration(null), 1500)
    await loadData()
  }

  async function addCommunityVisit() {
    const name = communityName.trim()
    if (!name || saving) {
      if (!name) setMessage('Enter a name or identifier for the community visitor first.')
      return
    }

    setSaving(true)
    setMessage('')

    const { error } = await supabase.rpc('sign_in_visitor', {
      p_name: name,
      p_visitor_type: communityGroup,
      p_purpose: communityPurpose,
      p_service_date: attendanceDate,
      p_source: 'staff',
    })

    if (error) {
      setMessage(error.message)
      setSaving(false)
      return
    }

    setCommunityName('')
    setSaving(false)
    setMessage(`${name} was signed in and saved.`)
    await loadData()
  }

  async function signOutVisitor(visitId: number) {
    if (saving) return
    setSaving(true)
    setMessage('')

    const { error } = await supabase.rpc('sign_out_visitor', { p_visit_id: visitId })
    if (error) setMessage(error.message)
    else setMessage('Visitor sign-out saved.')

    setSaving(false)
    await loadData()
  }

  async function voidVisit(visit: AttendanceVisit) {
    const reason = window.prompt('Why should this sign-in be removed from attendance totals? The original record will remain in the audit history.')?.trim()
    if (!reason || saving) return

    setSaving(true)
    setMessage('')
    const { error } = await supabase.rpc('void_attendance_visit', {
      p_visit_id: visit.id,
      p_reason: reason,
    })

    if (error) setMessage(error.message)
    else setMessage('The sign-in was voided and preserved in the audit history.')

    setSaving(false)
    await loadData()
  }

  async function setDayStatus(isOpen: boolean) {
    if (saving) return
    let reason = ''

    if (!isOpen) {
      reason = window.prompt('Why was the center closed on this date?')?.trim() ?? ''
      if (!reason) return
    }

    setSaving(true)
    setMessage('')
    const { error } = await supabase.rpc('set_operating_day', {
      p_service_date: attendanceDate,
      p_is_open: isOpen,
      p_reason: reason || null,
    })

    if (error) setMessage(error.message)
    else setMessage(isOpen ? 'This date is now counted as an open center day.' : 'This date is recorded as closed and will not count toward attendance averages.')

    setSaving(false)
    await loadData()
  }

  if (loading && !session) {
    return <main className="login-wrap"><div className="card login-card">Loading Attendance…</div></main>
  }

  if (!session) {
    return (
      <main className="login-wrap">
        <section className="card login-card">
          <h1>Attendance</h1>
          <p className="subtle">Sign in through Juanita Hub before using attendance.</p>
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
          <small>Attendance</small>
        </div>
        <div className="toolbar">
          <span>{profile.display_name} <span className="badge">{profile.role}</span></span>
        </div>
      </header>

      <main className="main attendance-page">
        <section className="hero attendance-hero">
          <div>
            <span className="attendance-eyebrow">Permanent records • saves automatically</span>
            <h1>Daily Attendance & Sign-Ins</h1>
            <p className="subtle">Child and community sign-ins are saved immediately to Juanita Hub and feed the monthly attendance reports.</p>
          </div>
          <label className="field attendance-date-field">
            <span>Attendance date</span>
            <input type="date" value={attendanceDate} max={today} onChange={(event) => setAttendanceDate(event.target.value)} />
          </label>
        </section>

        <section className="card attendance-operating-day">
          <div>
            <span className="attendance-eyebrow">Reporting denominator</span>
            <h2>Center operating day</h2>
            <p className="subtle">Monthly averages use days marked open—not calendar days.</p>
          </div>
          <div className="attendance-operating-actions">
            <span className={`attendance-day-status ${operatingDay ? (operatingDay.is_open ? 'open' : 'closed') : 'unrecorded'}`}>
              {operatingDay ? (operatingDay.is_open ? 'Open day' : `Closed${operatingDay.reason ? ` • ${operatingDay.reason}` : ''}`) : 'Not recorded yet'}
            </span>
            <button type="button" className="ghost" onClick={() => void setDayStatus(true)} disabled={saving}>Mark open</button>
            <button type="button" className="ghost" onClick={() => void setDayStatus(false)} disabled={saving}>Mark closed</button>
          </div>
        </section>

        {message && <div className="notice">{message}</div>}

        <section className="grid attendance-stats">
          <div className="card stat"><span className="subtle">Here now</span><strong>{presentNow}</strong></div>
          <div className="card stat"><span className="subtle">Total sign-ins</span><strong>{totalVisits}</strong></div>
          <div className="card stat"><span className="subtle">Children signed in</span><strong>{childSignedIn}/{children.length}</strong></div>
          <div className="card stat"><span className="subtle">Community sign-ins</span><strong>{communityVisits.length}</strong></div>
        </section>

        <section className="card attendance-workspace">
          <div className="attendance-tabs" role="tablist" aria-label="Attendance type">
            <button type="button" className={tab === 'children' ? 'active' : ''} onClick={() => setTab('children')}>
              Youth Sign-In
              <span>{childSignedIn} signed in</span>
            </button>
            <button type="button" className={tab === 'community' ? 'active' : ''} onClick={() => setTab('community')}>
              Community
              <span>{communityPresentNow} here now</span>
            </button>
          </div>

          {tab === 'children' ? (
            <div className="attendance-panel">
              <div className="attendance-kiosk-intro">
                <div className="attendance-kiosk-steps" aria-label="Youth sign-in steps">
                  <span><strong>1</strong> Find your name</span>
                  <span><strong>2</strong> Tap Sign In</span>
                  <span><strong>3</strong> Choose how you feel</span>
                </div>
                <label className="attendance-search">
                  <span className="sr-only">Search children</span>
                  <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search a name…" />
                </label>
              </div>

              <div className="attendance-roster attendance-live-roster">
                {filteredChildren.map((child) => {
                  const visit = childVisitByChild.get(child.id)
                  const mood = visit ? moodDetails(wellbeing[visit.id]) : null

                  return (
                    <article key={child.id} className={`attendance-person attendance-live-person ${visit ? 'present' : ''}`}>
                      <span className="attendance-person-name">{childName(child)}</span>
                      <span className="attendance-person-status">
                        {!visit && 'Not signed in yet'}
                        {visit && `${mood?.emoji ?? '✓'} Signed in at ${formatTime(visit.signed_in_at)}`}
                      </span>
                      <div className="attendance-live-actions">
                        {!visit ? (
                          <button type="button" className="primary" onClick={() => startChildSignIn(child)} disabled={saving}>Sign In</button>
                        ) : (
                          <>
                            <button type="button" className="ghost" onClick={() => startMoodCorrection(child, visit.id)} disabled={saving}>Change mood</button>
                            <button type="button" className="ghost danger-button" onClick={() => void voidVisit(visit)} disabled={saving}>Void sign-in</button>
                          </>
                        )}
                      </div>
                    </article>
                  )
                })}

                {filteredChildren.length === 0 && <div className="empty">No children match that search.</div>}
              </div>
            </div>
          ) : (
            <div className="attendance-panel">
              <div className="section-heading attendance-section-heading">
                <div>
                  <h2>Community sign-in</h2>
                  <p className="subtle">Adults, families, and visitors are counted alongside youth attendance for monthly reporting.</p>
                </div>
              </div>

              <div className="attendance-community-layout">
                <section className="attendance-checkin-form">
                  <div className="field">
                    <label>Name or identifier</label>
                    <input value={communityName} onChange={(event) => setCommunityName(event.target.value)} placeholder="Example: Maria S." onKeyDown={(event) => { if (event.key === 'Enter') void addCommunityVisit() }} />
                  </div>

                  <div className="attendance-form-grid">
                    <div className="field">
                      <label>Visitor type</label>
                      <select value={communityGroup} onChange={(event) => setCommunityGroup(event.target.value as 'Adult' | 'Family' | 'Visitor')}>
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

                  <button type="button" className="primary attendance-big-button" onClick={() => void addCommunityVisit()} disabled={saving}>
                    {saving ? 'Saving…' : 'Sign in visitor'}
                  </button>
                </section>

                <section>
                  <h3>Today's community sign-ins</h3>
                  <div className="attendance-community-list">
                    {communityVisits.length === 0 && <div className="empty">No community visitors are recorded for this date.</div>}
                    {communityVisits.map((visit) => (
                      <article className={`attendance-community-row attendance-live-community ${visit.signed_out_at ? 'checked-out' : ''}`} key={visit.id}>
                        <span>
                          <strong>{visit.visitor_name}</strong>
                          <small>{visit.participant_type.charAt(0).toUpperCase() + visit.participant_type.slice(1)} • {visit.purpose || 'No purpose selected'}</small>
                        </span>
                        <span>
                          <strong>{visit.signed_out_at ? 'Signed out' : 'Here now'}</strong>
                          <small>{visit.signed_out_at ? `${formatTime(visit.signed_in_at)}–${formatTime(visit.signed_out_at)}` : `Since ${formatTime(visit.signed_in_at)}`}</small>
                        </span>
                        <div className="attendance-live-actions compact">
                          {!visit.signed_out_at && <button type="button" className="ghost" onClick={() => void signOutVisitor(visit.id)} disabled={saving}>Sign out</button>}
                          <button type="button" className="ghost danger-button" onClick={() => void voidVisit(visit)} disabled={saving}>Void</button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          )}
        </section>

        <section className="card attendance-record-plan attendance-live-plan">
          <div>
            <span className="attendance-eyebrow">Now automatic</span>
            <h2>Attendance saves itself</h2>
            <p className="subtle">Every sign-in is written immediately. Corrections are audited, and monthly reports calculate totals and averages from these records.</p>
          </div>
          <div className="attendance-record-points">
            <span><strong>Instant</strong> database record</span>
            <span><strong>Audited</strong> corrections</span>
            <span><strong>Automatic</strong> monthly reports</span>
          </div>
        </section>
      </main>

      {selectedChild && (
        <div className="attendance-mood-backdrop" role="presentation" onClick={() => !saving && setSelectedChild(null)}>
          <section className="attendance-mood-dialog" role="dialog" aria-modal="true" aria-labelledby="attendance-mood-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="attendance-mood-close" aria-label="Cancel" onClick={() => !saving && setSelectedChild(null)}>×</button>
            <span className="attendance-mood-name">Hi, {selectedChild.first_name}!</span>
            <h2 id="attendance-mood-title">{moodMode === 'correct' ? 'Change the recorded mood' : 'How are you feeling today?'}</h2>
            <p className="subtle">{moodMode === 'correct' ? 'The correction will be saved in the attendance audit history.' : 'Pick the face that feels most like you right now.'}</p>
            <div className="attendance-mood-grid">
              {moods.map((mood) => (
                <button type="button" key={mood.value} className={`attendance-mood-option ${mood.value}`} onClick={() => void finishChildMood(mood.value)} disabled={saving}>
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
            <div className="attendance-celebration-sparkles" aria-hidden="true"><span>●</span><span>★</span><span>●</span><span>★</span><span>●</span></div>
            <span className="attendance-celebration-emoji" aria-hidden="true">{moods.find((item) => item.value === celebration.mood)?.emoji}</span>
            <h2>You're signed in, {celebration.firstName}!</h2>
            <p>Thanks for telling us how you're feeling. ✨</p>
          </div>
        </div>
      )}
    </div>
  )
}
