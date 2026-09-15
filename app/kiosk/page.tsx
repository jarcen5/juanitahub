'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Child = {
  id: number
  first_name: string
  last_name: string | null
}

type Mood = 'happy' | 'meh' | 'sad'

type KioskRecord = {
  mood: Mood
  time: string
}

const moods: Array<{ value: Mood; emoji: string; label: string }> = [
  { value: 'happy', emoji: '😀', label: 'Good' },
  { value: 'meh', emoji: '😐', label: 'Meh' },
  { value: 'sad', emoji: '🙁', label: 'Not great' },
]

function childName(child: Child) {
  return `${child.first_name}${child.last_name ? ` ${child.last_name}` : ''}`
}

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function KioskPreviewPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [children, setChildren] = useState<Child[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedChild, setSelectedChild] = useState<Child | null>(null)
  const [records, setRecords] = useState<Record<number, KioskRecord>>({})
  const [celebration, setCelebration] = useState<{ name: string; emoji: string } | null>(null)

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

  function chooseMood(mood: Mood) {
    if (!selectedChild) return
    const detail = moods.find((item) => item.value === mood) ?? moods[1]

    setRecords((current) => ({
      ...current,
      [selectedChild.id]: { mood, time: timeNow() },
    }))

    setCelebration({ name: selectedChild.first_name, emoji: detail.emoji })
    setSelectedChild(null)
    setSearch('')

    window.setTimeout(() => setCelebration(null), 1500)
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
          <Link href="/" className="kiosk-exit-button">Return to staff sign-in</Link>
        </section>
      </main>
    )
  }

  return (
    <main className="kiosk-shell">
      <div className="kiosk-preview-ribbon">Preview only • nothing is saved</div>

      <header className="kiosk-header">
        <div className="kiosk-brand">
          <span className="kiosk-logo">JH</span>
          <span><strong>Welcome!</strong><small>Check in for today</small></span>
        </div>
        <Link href="/" className="kiosk-exit-button">Staff exit</Link>
      </header>

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
            const mood = record ? moods.find((item) => item.value === record.mood) : null

            return (
              <button
                type="button"
                key={child.id}
                className={`kiosk-name-card ${record ? 'done' : ''}`}
                onClick={() => !record && setSelectedChild(child)}
                disabled={Boolean(record)}
              >
                <span className="kiosk-avatar">{child.first_name.charAt(0).toUpperCase()}</span>
                <span className="kiosk-name-text"><strong>{childName(child)}</strong>{record ? <small>{mood?.emoji} Checked in at {record.time}</small> : <small>Tap to check in</small>}</span>
                {record && <span className="kiosk-check">✓</span>}
              </button>
            )
          })}
        </div>
      </section>

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
            <h2>You’re checked in, {celebration.name}!</h2>
            <p>Have a great day at the center.</p>
          </div>
        </div>
      )}
    </main>
  )
}
