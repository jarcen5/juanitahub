'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import HistoryEntryList from '@/components/HistoryEntryList'
import { supabase } from '@/lib/supabase'

type Child = {
  id: number
  first_name: string
  last_name: string | null
  active: boolean
}

type CardName = 'diamond' | 'green' | 'yellow' | 'orange' | 'red'

type Entry = {
  id: number
  child_id: number
  entry_date: string
  entry_type: 'behavior' | 'status'
  card: CardName | null
  day_status: string | null
  points: number
  note: string | null
  recorded_by: string
}

type StaffProfile = {
  display_name: string
  role: 'staff' | 'admin'
  active: boolean
}

type AppSettings = {
  wheel_rule_mode: 'pending' | 'points_per_spin' | 'tiers'
  points_per_spin: number | null
  wheel_rule_notes: string | null
}

type ViewName = 'today' | 'summary' | 'history' | 'children'

const cards: { name: CardName; label: string; points: number; symbol: string }[] = [
  { name: 'diamond', label: 'Diamond', points: 2, symbol: '◆' },
  { name: 'green', label: 'Green', points: 1, symbol: '●' },
  { name: 'yellow', label: 'Yellow', points: -0.5, symbol: '●' },
  { name: 'orange', label: 'Orange', points: -1, symbol: '●' },
  { name: 'red', label: 'Red', points: -2, symbol: '●' },
]

const statusOptions = [
  ['absent', 'Absent'],
  ['sick', 'Sick'],
  ['didnt_report', "Didn't Report"],
  ['field_trip', 'Field Trip'],
  ['closed', 'Closed'],
  ['other', 'Other'],
]

function localDateString(date = new Date()) {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

function currentMonthKey() {
  return localDateString().slice(0, 7)
}

function monthBoundsFromKey(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0)
  return { start: localDateString(start), end: localDateString(end) }
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function shiftMonth(monthKey: string, amount: number) {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(year, month - 1 + amount, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function childFullName(child: Child) {
  return `${child.first_name}${child.last_name ? ` ${child.last_name}` : ''}`
}

function prettyStatus(status: string | null) {
  if (!status) return ''
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function prettyCard(card: CardName | null) {
  if (!card) return ''
  return card.charAt(0).toUpperCase() + card.slice(1)
}

function formatPoints(points: number) {
  const value = Number(points || 0)
  return `${value > 0 ? '+' : ''}${value}`
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [children, setChildren] = useState<Child[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newChildName, setNewChildName] = useState('')
  const [activeView, setActiveView] = useState<ViewName>('today')
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey())
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null)

  const today = localDateString()
  const bounds = useMemo(() => monthBoundsFromKey(selectedMonth), [selectedMonth])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setProfile(null)
      setSettings(null)
      setChildren([])
      setEntries([])
      return
    }

    void loadAppData()
  }, [session, selectedMonth])

  async function loadAppData() {
    if (!session) return

    setLoading(true)

    const [profileResult, settingsResult, childrenResult, entriesResult] = await Promise.all([
      supabase.from('staff_profiles').select('display_name, role, active').eq('user_id', session.user.id).maybeSingle(),
      supabase.from('app_settings').select('wheel_rule_mode, points_per_spin, wheel_rule_notes').eq('id', 1).maybeSingle(),
      supabase.from('children').select('id, first_name, last_name, active').eq('active', true).order('first_name'),
      supabase
        .from('behavior_entries')
        .select('id, child_id, entry_date, entry_type, card, day_status, points, note, recorded_by')
        .gte('entry_date', bounds.start)
        .lte('entry_date', bounds.end)
        .order('entry_date', { ascending: false }),
    ])

    setProfile(profileResult.data as StaffProfile | null)
    setSettings(settingsResult.data as AppSettings | null)
    setChildren((childrenResult.data ?? []) as Child[])
    setEntries((entriesResult.data ?? []) as Entry[])
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
    else setMessage('Account created. If email confirmation is enabled, check your inbox. An administrator must also activate your staff profile.')
  }

  async function saveBehavior(childId: number, card: CardName) {
    if (!session || !profile?.active) return

    const existing = todayEntries.get(childId)
    const result = existing
      ? await supabase
          .from('behavior_entries')
          .update({ entry_type: 'behavior', card, day_status: null })
          .eq('id', existing.id)
      : await supabase
          .from('behavior_entries')
          .insert({
            child_id: childId,
            entry_date: today,
            entry_type: 'behavior',
            card,
            day_status: null,
            recorded_by: session.user.id,
          })

    if (result.error) {
      setMessage(result.error.message)
      return
    }

    setMessage(existing ? 'Behavior card corrected. The change was added to the audit trail.' : 'Behavior card saved.')
    await loadAppData()
  }

  async function saveStatus(childId: number, status: string) {
    if (!session || !profile?.active) return

    const existing = todayEntries.get(childId)
    const result = existing
      ? await supabase
          .from('behavior_entries')
          .update({ entry_type: 'status', card: null, day_status: status })
          .eq('id', existing.id)
      : await supabase
          .from('behavior_entries')
          .insert({
            child_id: childId,
            entry_date: today,
            entry_type: 'status',
            card: null,
            day_status: status,
            recorded_by: session.user.id,
          })

    if (result.error) {
      setMessage(result.error.message)
      return
    }

    setMessage(existing ? 'Daily status corrected. The change was added to the audit trail.' : 'Daily status saved.')
    await loadAppData()
  }

  async function addChild() {
    if (!newChildName.trim() || profile?.role !== 'admin') return

    const parts = newChildName.trim().split(/\s+/)
    const firstName = parts.shift() ?? ''
    const lastName = parts.join(' ') || null
    const { error } = await supabase.from('children').insert({ first_name: firstName, last_name: lastName })

    if (error) {
      setMessage(error.message)
      return
    }

    setNewChildName('')
    setMessage('Child added to the active roster.')
    await loadAppData()
  }

  function spinsForPoints(points: number) {
    const pointsPerSpin = Number(settings?.points_per_spin ?? 0)
    if (settings?.wheel_rule_mode !== 'points_per_spin' || pointsPerSpin <= 0) return 0
    return Math.max(0, Math.round(points / pointsPerSpin))
  }

  function goToToday() {
    setSelectedMonth(currentMonthKey())
    setActiveView('today')
  }

  function openHistory(childId?: number) {
    const fallbackId = children[0]?.id ?? null
    setSelectedChildId(childId ?? selectedChildId ?? fallbackId)
    setActiveView('history')
  }

  const todayEntries = useMemo(
    () => new Map(entries.filter((entry) => entry.entry_date === today).map((entry) => [entry.child_id, entry])),
    [entries, today],
  )

  const monthlyPoints = useMemo(
    () => entries.reduce((sum, entry) => sum + Number(entry.points || 0), 0),
    [entries],
  )

  const childSummaries = useMemo(
    () => children.map((child) => {
      const childEntries = entries.filter((entry) => entry.child_id === child.id)
      const points = childEntries.reduce((sum, entry) => sum + Number(entry.points || 0), 0)
      return {
        ...child,
        points,
        spins: spinsForPoints(points),
        entries: childEntries.length,
      }
    }),
    [children, entries, settings],
  )

  const totalWheelSpins = useMemo(
    () => childSummaries.reduce((sum, child) => sum + child.spins, 0),
    [childSummaries],
  )

  const selectedChild = useMemo(
    () => children.find((child) => child.id === selectedChildId) ?? null,
    [children, selectedChildId],
  )

  const selectedChildEntries = useMemo(
    () => entries.filter((entry) => entry.child_id === selectedChildId).sort((a, b) => b.entry_date.localeCompare(a.entry_date)),
    [entries, selectedChildId],
  )

  const selectedChildPoints = useMemo(
    () => selectedChildEntries.reduce((sum, entry) => sum + Number(entry.points || 0), 0),
    [selectedChildEntries],
  )

  const completedToday = selectedMonth === currentMonthKey() ? todayEntries.size : 0
  const diamondCount = entries.filter((entry) => entry.card === 'diamond').length
  const greenCount = entries.filter((entry) => entry.card === 'green').length
  const wheelRuleReady = settings?.wheel_rule_mode === 'points_per_spin' && Number(settings.points_per_spin) > 0
  const historySpins = spinsForPoints(selectedChildPoints)

  const viewTitle = activeView === 'today'
    ? "Today's Behavior"
    : activeView === 'summary'
      ? 'Monthly Summary'
      : activeView === 'history'
        ? 'Child History'
        : 'Children'

  if (loading && !session) {
    return <main className="login-wrap"><div className="card login-card">Loading Juanita Hub…</div></main>
  }

  if (!session) {
    return (
      <main className="login-wrap">
        <section className="card login-card">
          <div className="brand" style={{ color: '#172033', marginBottom: 22 }}>
            Juanita Hub
            <small style={{ color: '#667085' }}>JSCLC behavior & rewards tracker</small>
          </div>
          <h1 style={{ fontSize: 30 }}>{authMode === 'signin' ? 'Staff sign in' : 'Create staff account'}</h1>
          <p className="subtle">Use your work-approved account to access behavior records.</p>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
            />
          </div>
          {message && <div className={message.toLowerCase().includes('created') ? 'notice success' : 'notice error'}>{message}</div>}
          <button className="primary" style={{ width: '100%' }} onClick={handleAuth}>
            {authMode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
          <button className="ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}>
            {authMode === 'signin' ? 'Need an account?' : 'Already have an account?'}
          </button>
        </section>
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="login-wrap">
        <section className="card login-card">
          <h1 style={{ fontSize: 30 }}>Account awaiting activation</h1>
          <p className="subtle">Your login works, but this account does not have an active Juanita Hub staff profile yet.</p>
          <div className="notice">Signed in as <strong>{session.user.email}</strong>. Ask an administrator to activate this account.</div>
          <button className="primary" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </section>
      </main>
    )
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Juanita Hub<small>JSCLC behavior & rewards tracker</small></div>
        <div className="toolbar">
          <span>{profile.display_name} <span className="badge">{profile.role}</span></span>
          <button className="ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>

      <main className="main">
        <div className="hero">
          <div>
            <h1>{viewTitle}</h1>
            <p className="subtle">
              {activeView === 'today'
                ? new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
                : monthLabel(selectedMonth)}
            </p>
          </div>
          <nav className="nav">
            <button className={activeView === 'today' ? 'active' : ''} onClick={goToToday}>Today</button>
            <button className={activeView === 'summary' ? 'active' : ''} onClick={() => setActiveView('summary')}>Monthly Summary</button>
            <button className={activeView === 'history' ? 'active' : ''} onClick={() => openHistory()}>History</button>
            <button className={activeView === 'children' ? 'active' : ''} onClick={() => setActiveView('children')}>Children</button>
          </nav>
        </div>

        {(activeView === 'summary' || activeView === 'history') && (
          <section className="month-bar card">
            <div>
              <span className="subtle month-label">Viewing month</span>
              <strong>{monthLabel(selectedMonth)}</strong>
            </div>
            <div className="month-controls">
              <button className="ghost" onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))} aria-label="Previous month">←</button>
              <input
                type="month"
                value={selectedMonth}
                onChange={(event) => event.target.value && setSelectedMonth(event.target.value)}
                aria-label="Select month"
              />
              <button className="ghost" onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))} aria-label="Next month">→</button>
              {selectedMonth !== currentMonthKey() && (
                <button className="ghost" onClick={() => setSelectedMonth(currentMonthKey())}>This month</button>
              )}
            </div>
          </section>
        )}

        {message && <div className="notice">{message}</div>}

        <section className="grid stats">
          <div className="card stat"><span className="subtle">Active children</span><strong>{children.length}</strong></div>
          <div className="card stat">
            <span className="subtle">{activeView === 'today' ? 'Completed today' : 'Recorded entries'}</span>
            <strong>{activeView === 'today' ? `${completedToday}/${children.length}` : entries.length}</strong>
          </div>
          <div className="card stat"><span className="subtle">{monthLabel(selectedMonth)} points</span><strong>{monthlyPoints}</strong></div>
          <div className="card stat"><span className="subtle">Total wheel spins</span><strong>{wheelRuleReady ? totalWheelSpins : 'Pending'}</strong></div>
        </section>

        {activeView === 'today' && (
          <section className="card" style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 18 }}>
              <h2>Daily cards</h2>
              <p className="subtle">Choose one behavior card or a non-behavior status for each child. Selecting again replaces today's entry and records the correction in the audit trail.</p>
            </div>
            <div className="roster">
              {children.length === 0 && <div className="empty">No active children yet. An admin can add the first child from the Children tab.</div>}
              {children.map((child) => {
                const entry = todayEntries.get(child.id)
                return (
                  <div className="child-row" key={child.id}>
                    <div>
                      <button className="name-link" onClick={() => openHistory(child.id)}>{childFullName(child)}</button>
                      <div className="subtle" style={{ fontSize: 13, marginTop: 4 }}>
                        {entry?.entry_type === 'behavior'
                          ? `${prettyCard(entry.card)} card • ${formatPoints(entry.points)}`
                          : entry?.day_status
                            ? prettyStatus(entry.day_status)
                            : 'Not entered yet'}
                      </div>
                    </div>
                    <div>
                      <div className="behavior-buttons">
                        {cards.map((card) => (
                          <button
                            key={card.name}
                            className={`behavior-button ${card.name} ${entry?.card === card.name ? 'selected' : ''}`}
                            onClick={() => saveBehavior(child.id, card.name)}
                            title={`${card.label}: ${card.points > 0 ? '+' : ''}${card.points} points`}
                          >
                            {card.symbol} {card.points > 0 ? '+' : ''}{card.points}
                          </button>
                        ))}
                        <select
                          value={entry?.entry_type === 'status' ? entry.day_status ?? '' : ''}
                          onChange={(event) => event.target.value && saveStatus(child.id, event.target.value)}
                          style={{ border: '1px solid #cfd4dc', borderRadius: 10, padding: '9px 10px', background: 'white' }}
                        >
                          <option value="">Status…</option>
                          {statusOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {activeView === 'summary' && (
          <section className="grid panel-grid">
            <div className="card">
              <h2>Points & spins by child</h2>
              <p className="subtle">
                {monthLabel(selectedMonth)}. {wheelRuleReady ? `Every ${Number(settings?.points_per_spin)} points earns 1 spin, rounded to the nearest whole spin.` : 'Prize-wheel conversion is pending.'}
              </p>
              {childSummaries.map((child) => (
                <div className="summary-row clickable-row" key={child.id} onClick={() => openHistory(child.id)}>
                  <span>
                    <strong>{childFullName(child)}</strong><br />
                    <span className="subtle" style={{ fontSize: 13 }}>{child.entries} recorded {child.entries === 1 ? 'day' : 'days'}</span>
                  </span>
                  <span className="summary-actions">
                    <strong>{child.points} pts • {wheelRuleReady ? `${child.spins} spin${child.spins === 1 ? '' : 's'}` : 'Pending'}</strong>
                    <span className="history-link">View history →</span>
                  </span>
                </div>
              ))}
              {children.length === 0 && <div className="empty">No children to summarize yet.</div>}
            </div>

            <div className="card">
              <h2>Card totals</h2>
              <div className="summary-row"><span>◆ Diamond</span><strong>{diamondCount}</strong></div>
              <div className="summary-row"><span>● Green</span><strong>{greenCount}</strong></div>
              <div className="summary-row"><span>● Yellow</span><strong>{entries.filter((entry) => entry.card === 'yellow').length}</strong></div>
              <div className="summary-row"><span>● Orange</span><strong>{entries.filter((entry) => entry.card === 'orange').length}</strong></div>
              <div className="summary-row"><span>● Red</span><strong>{entries.filter((entry) => entry.card === 'red').length}</strong></div>
              <div className="summary-row"><span>Statuses / non-behavior days</span><strong>{entries.filter((entry) => entry.entry_type === 'status').length}</strong></div>
            </div>
          </section>
        )}

        {activeView === 'history' && (
          <section className="history-layout">
            <aside className="card history-sidebar">
              <h2>Choose child</h2>
              <div className="field" style={{ marginBottom: 0 }}>
                <select value={selectedChildId ?? ''} onChange={(event) => setSelectedChildId(Number(event.target.value))}>
                  <option value="" disabled>Select a child…</option>
                  {children.map((child) => (
                    <option key={child.id} value={child.id}>{childFullName(child)}</option>
                  ))}
                </select>
              </div>
              {selectedChild && (
                <div className="history-mini-stats">
                  <div><span className="subtle">Points</span><strong>{selectedChildPoints}</strong></div>
                  <div><span className="subtle">Spins</span><strong>{wheelRuleReady ? historySpins : 'Pending'}</strong></div>
                  <div><span className="subtle">Entries</span><strong>{selectedChildEntries.length}</strong></div>
                </div>
              )}
            </aside>

            <div className="card history-panel">
              {selectedChild ? (
                <>
                  <div className="history-heading">
                    <div>
                      <h2>{childFullName(selectedChild)}</h2>
                      <p className="subtle">{monthLabel(selectedMonth)} behavior history</p>
                    </div>
                    <button className="ghost" onClick={() => setActiveView('summary')}>Back to summary</button>
                  </div>

                  {selectedChildEntries.length === 0 ? (
                    <div className="empty">No entries for {childFullName(selectedChild)} in {monthLabel(selectedMonth)}.</div>
                  ) : (
                    <HistoryEntryList entries={selectedChildEntries} onSaved={loadAppData} />
                  )}
                </>
              ) : (
                <div className="empty">Choose a child to view their history.</div>
              )}
            </div>
          </section>
        )}

        {activeView === 'children' && (
          <section className="card" style={{ marginTop: 16 }}>
            <h2>Active roster</h2>
            {profile.role === 'admin' && (
              <div className="toolbar" style={{ marginBottom: 18 }}>
                <input
                  value={newChildName}
                  onChange={(event) => setNewChildName(event.target.value)}
                  placeholder="Child name"
                  style={{ minWidth: 260, border: '1px solid #cfd4dc', borderRadius: 10, padding: '10px 12px' }}
                />
                <button className="primary" onClick={addChild}>Add child</button>
              </div>
            )}
            {children.map((child) => (
              <div className="summary-row" key={child.id}>
                <button className="name-link" onClick={() => openHistory(child.id)}>{childFullName(child)}</button>
                <span className="toolbar">
                  <button className="ghost compact-button" onClick={() => openHistory(child.id)}>View history</button>
                  <span className="badge">Active</span>
                </span>
              </div>
            ))}
            {children.length === 0 && <div className="empty">The active roster is empty.</div>}
          </section>
        )}
      </main>
    </div>
  )
}
