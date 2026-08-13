'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Profile = { display_name: string; role: 'staff' | 'admin'; active: boolean }
type Child = { id: number; first_name: string; last_name: string | null; active: boolean }
type CardRule = { card: string; points: number; display_order: number }
type ExistingEntry = { id: number; child_id: number; entry_type: 'behavior' | 'status'; card: string | null; day_status: string | null }
type Draft = { entry_type: 'behavior' | 'status'; card: string | null; day_status: string | null; note: string }

const statuses = [
  ['absent', 'Absent'],
  ['sick', 'Sick'],
  ['didnt_report', "Didn't Report"],
  ['field_trip', 'Field Trip'],
  ['closed', 'Closed'],
  ['other', 'Other'],
]

function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

function yesterday() {
  const date = new Date()
  date.setDate(date.getDate() - 1)
  return localDate(date)
}

function childName(child: Child) {
  return `${child.first_name}${child.last_name ? ` ${child.last_name}` : ''}`
}

function pretty(value: string | null) {
  if (!value) return ''
  return value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function prettyDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

export default function MissedCardsPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [date, setDate] = useState(yesterday())
  const [children, setChildren] = useState<Child[]>([])
  const [rules, setRules] = useState<CardRule[]>([])
  const [existing, setExisting] = useState<ExistingEntry[]>([])
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)

  const maxDate = yesterday()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) void loadData()
  }, [session, date])

  async function loadData() {
    if (!session) return
    setLoading(true)
    setMessage('')
    setError(false)

    const profileResult = await supabase
      .from('staff_profiles')
      .select('display_name, role, active')
      .eq('user_id', session.user.id)
      .maybeSingle()

    const nextProfile = profileResult.data as Profile | null
    setProfile(nextProfile)
    if (profileResult.error || !nextProfile?.active) {
      if (profileResult.error) {
        setMessage(profileResult.error.message)
        setError(true)
      }
      setLoading(false)
      return
    }

    const [childrenResult, rulesResult, existingResult] = await Promise.all([
      supabase.from('children').select('id, first_name, last_name, active').order('first_name').order('last_name'),
      supabase.from('card_rules').select('card, points, display_order').order('display_order'),
      supabase.from('behavior_entries').select('id, child_id, entry_type, card, day_status').eq('entry_date', date),
    ])

    const loadError = childrenResult.error || rulesResult.error || existingResult.error
    if (loadError) {
      setMessage(loadError.message)
      setError(true)
    }

    setChildren((childrenResult.data ?? []) as Child[])
    setRules((rulesResult.data ?? []) as CardRule[])
    setExisting((existingResult.data ?? []) as ExistingEntry[])
    setDrafts({})
    setLoading(false)
  }

  const existingByChild = useMemo(() => new Map(existing.map((row) => [row.child_id, row])), [existing])
  const selectedCount = useMemo(
    () => Object.values(drafts).filter((draft) => Boolean(draft.card || draft.day_status)).length,
    [drafts],
  )

  function chooseCard(childId: number, card: string) {
    setDrafts((current) => ({
      ...current,
      [childId]: { entry_type: 'behavior', card, day_status: null, note: current[childId]?.note ?? '' },
    }))
  }

  function chooseStatus(childId: number, status: string) {
    if (!status) {
      setDrafts((current) => {
        const next = { ...current }
        delete next[childId]
        return next
      })
      return
    }
    setDrafts((current) => ({
      ...current,
      [childId]: { entry_type: 'status', card: null, day_status: status, note: current[childId]?.note ?? '' },
    }))
  }

  function updateNote(childId: number, note: string) {
    setDrafts((current) => ({
      ...current,
      [childId]: {
        ...(current[childId] ?? { entry_type: 'behavior', card: null, day_status: null, note: '' }),
        note,
      },
    }))
  }

  async function saveMissedEntries() {
    if (!session || !profile?.active || selectedCount === 0) return

    const rows = Object.entries(drafts)
      .map(([childId, draft]) => ({ childId: Number(childId), draft }))
      .filter(({ childId, draft }) => !existingByChild.has(childId) && Boolean(draft.card || draft.day_status))
      .map(({ childId, draft }) => ({
        child_id: childId,
        entry_date: date,
        entry_type: draft.entry_type,
        card: draft.entry_type === 'behavior' ? draft.card : null,
        day_status: draft.entry_type === 'status' ? draft.day_status : null,
        note: draft.note.trim() || null,
        recorded_by: session.user.id,
      }))

    if (!rows.length) return
    setSaving(true)
    setMessage('')
    setError(false)

    const { error: insertError } = await supabase.from('behavior_entries').insert(rows)
    setSaving(false)

    if (insertError) {
      setMessage(insertError.code === '23505'
        ? 'One of those children already has an entry for this date. Refresh the page and use History to edit existing records.'
        : insertError.message)
      setError(true)
      return
    }

    setMessage(`${rows.length} missed ${rows.length === 1 ? 'entry was' : 'entries were'} added for ${prettyDate(date)}.`)
    await loadData()
  }

  if (loading && !session) return <main className="login-wrap"><div className="card login-card">Loading missed cards…</div></main>

  if (!session) {
    return <main className="login-wrap"><section className="card login-card"><h1>Missed Cards</h1><p className="subtle">Sign in through Juanita Hub first.</p><a className="primary" href="/" style={{ textDecoration: 'none', display: 'inline-block' }}>Go to sign in</a></section></main>
  }

  if (!profile?.active) {
    return <main className="login-wrap"><section className="card login-card"><h1>Missed Cards</h1><div className="notice">Your staff account must be active before you can add behavior records.</div></section></main>
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Juanita Hub<small>Missed behavior cards</small></div>
        <div className="toolbar"><span>{profile.display_name} <span className="badge">{profile.role}</span></span></div>
      </header>

      <main className="main">
        <div className="hero">
          <div>
            <h1>Add Missed Cards</h1>
            <p className="subtle">Backfill cards or statuses that were forgotten on an earlier day. Existing records are protected from being overwritten.</p>
          </div>
          <label className="field" style={{ marginBottom: 0, minWidth: 210 }}>
            <span style={{ fontWeight: 700 }}>Missed date</span>
            <input type="date" value={date} max={maxDate} onChange={(event) => event.target.value && setDate(event.target.value)} />
          </label>
        </div>

        {message && <div className={`notice ${error ? 'error' : 'success'}`}>{message}</div>}

        <section className="card" style={{ marginBottom: 16 }}>
          <div className="section-heading">
            <div>
              <h2>{prettyDate(date)}</h2>
              <p className="subtle">Select entries for the children who were missed, then save them together.</p>
            </div>
            <span className="badge">{selectedCount} selected</span>
          </div>

          <div className="notice" style={{ marginBottom: 16 }}>
            <strong>◆ Diamond:</strong> +2 points and +1 additional monthly spin.
          </div>

          <div className="roster">
            {children.map((child) => {
              const saved = existingByChild.get(child.id)
              const draft = drafts[child.id]
              return (
                <div className="child-row" key={child.id} style={{ alignItems: 'start' }}>
                  <div style={{ minWidth: 190 }}>
                    <strong>{childName(child)}</strong>{!child.active && <span className="badge archived-badge">Archived</span>}
                    <div className="subtle" style={{ fontSize: 13, marginTop: 4 }}>
                      {saved
                        ? `Already entered: ${saved.entry_type === 'behavior' ? `${pretty(saved.card)} card` : pretty(saved.day_status)}`
                        : draft?.card
                          ? `${pretty(draft.card)} selected`
                          : draft?.day_status
                            ? pretty(draft.day_status)
                            : 'No entry selected'}
                    </div>
                  </div>

                  {saved ? (
                    <div className="notice" style={{ margin: 0, flex: 1 }}>This child already has a record for this date. Use History if it needs to be corrected.</div>
                  ) : (
                    <div style={{ flex: 1 }}>
                      <div className="behavior-buttons" style={{ marginBottom: 8 }}>
                        {rules.map((rule) => (
                          <button
                            key={rule.card}
                            className={`behavior-button ${rule.card} ${draft?.card === rule.card ? 'selected' : ''}`}
                            onClick={() => chooseCard(child.id, rule.card)}
                            title={rule.card === 'diamond' ? 'Diamond: +2 points and +1 bonus spin' : `${pretty(rule.card)}: ${Number(rule.points) > 0 ? '+' : ''}${Number(rule.points)} points`}
                          >
                            {rule.card === 'diamond' ? '◆' : '●'} {Number(rule.points) > 0 ? '+' : ''}{Number(rule.points)}{rule.card === 'diamond' ? ' + spin' : ''}
                          </button>
                        ))}
                        <select
                          value={draft?.entry_type === 'status' ? draft.day_status ?? '' : ''}
                          onChange={(event) => chooseStatus(child.id, event.target.value)}
                          style={{ border: '1px solid #cfd4dc', borderRadius: 10, padding: '9px 10px', background: 'white' }}
                        >
                          <option value="">Status…</option>
                          {statuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                        </select>
                      </div>
                      {(draft?.card || draft?.day_status) && (
                        <input
                          value={draft.note}
                          onChange={(event) => updateNote(child.id, event.target.value)}
                          placeholder="Optional note"
                          style={{ width: '100%', border: '1px solid #cfd4dc', borderRadius: 9, padding: '8px 10px' }}
                        />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <button className="primary" disabled={saving || selectedCount === 0} onClick={saveMissedEntries} style={{ padding: '12px 18px' }}>
          {saving ? 'Saving missed entries…' : `Save ${selectedCount} missed ${selectedCount === 1 ? 'entry' : 'entries'}`}
        </button>
      </main>
    </div>
  )
}
