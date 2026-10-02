'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Profile = { display_name: string; role: 'staff' | 'admin'; active: boolean }
type FulfillmentRow = {
  source: 'monthly' | 'free'
  win_id: number
  child_id: number
  first_name: string
  last_name: string | null
  month_start: string
  prize_name: string
  category_name: string
  tier_name: string
  reason: string | null
  won_at: string
  received_at: string | null
  received_by: string | null
}

type Filter = 'outstanding' | 'all' | 'received'

function previousMonth() {
  const now = new Date()
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(month: string, offset: number) {
  const [year, number] = month.split('-').map(Number)
  const shifted = new Date(year, number - 1 + offset, 1)
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`
}

function monthStart(month: string) {
  return `${month}-01`
}

function monthLabel(month: string) {
  const [year, number] = month.split('-').map(Number)
  return new Date(year, number - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function dateTimeLabel(value: string) {
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function sourceLabel(source: FulfillmentRow['source']) {
  return source === 'free' ? 'Free Spin' : 'Monthly Wheel'
}

export default function PrizeFulfillmentPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [month, setMonth] = useState(previousMonth())
  const [rows, setRows] = useState<FulfillmentRow[]>([])
  const [filter, setFilter] = useState<Filter>('outstanding')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState('')
  const [message, setMessage] = useState('')
  const [messageKind, setMessageKind] = useState<'info' | 'error' | 'success'>('info')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    void loadData()
  }, [session, month])

  function showMessage(text: string, kind: 'info' | 'error' | 'success' = 'info') {
    setMessage(text)
    setMessageKind(kind)
  }

  async function loadData() {
    if (!session) return
    setLoading(true)
    setMessage('')

    const [profileResult, winsResult] = await Promise.all([
      supabase.from('staff_profiles').select('display_name, role, active').eq('user_id', session.user.id).maybeSingle(),
      supabase
        .from('reward_prize_fulfillment')
        .select('source, win_id, child_id, first_name, last_name, month_start, prize_name, category_name, tier_name, reason, won_at, received_at, received_by')
        .eq('month_start', monthStart(month))
        .order('first_name')
        .order('last_name')
        .order('won_at'),
    ])

    setProfile(profileResult.data as Profile | null)
    setRows((winsResult.data ?? []) as FulfillmentRow[])
    const error = profileResult.error || winsResult.error
    if (error) showMessage(error.message, 'error')
    setLoading(false)
  }

  const summary = useMemo(() => {
    const outstanding = rows.filter((row) => !row.received_at).length
    const received = rows.length - outstanding
    const children = new Set(rows.map((row) => row.child_id)).size
    return { total: rows.length, outstanding, received, children }
  }, [rows])

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (filter === 'outstanding' && row.received_at) return false
      if (filter === 'received' && !row.received_at) return false
      if (!needle) return true
      const haystack = [row.first_name, row.last_name, row.prize_name, row.category_name, row.tier_name, row.reason]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [rows, filter, search])

  const grouped = useMemo(() => {
    const map = new Map<number, { child_id: number; name: string; rows: FulfillmentRow[] }>()
    for (const row of visibleRows) {
      const name = `${row.first_name}${row.last_name ? ` ${row.last_name}` : ''}`
      const current = map.get(row.child_id) ?? { child_id: row.child_id, name, rows: [] }
      current.rows.push(row)
      map.set(row.child_id, current)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [visibleRows])

  async function updateRows(targets: FulfillmentRow[], received: boolean) {
    if (!session || savingKey || targets.length === 0) return
    const key = targets.length === 1 ? `${targets[0].source}-${targets[0].win_id}` : `child-${targets[0].child_id}`
    setSavingKey(key)
    setMessage('')

    const timestamp = received ? new Date().toISOString() : null
    const monthlyIds = targets.filter((row) => row.source === 'monthly').map((row) => row.win_id)
    const freeIds = targets.filter((row) => row.source === 'free').map((row) => row.win_id)

    const requests = [] as PromiseLike<any>[]
    if (monthlyIds.length) {
      requests.push(
        supabase
          .from('prize_wins')
          .update({ received_at: timestamp, received_by: received ? session.user.id : null })
          .in('id', monthlyIds)
          .select('id'),
      )
    }
    if (freeIds.length) {
      requests.push(
        supabase
          .from('free_prize_wins')
          .update({ received_at: timestamp, received_by: received ? session.user.id : null })
          .in('id', freeIds)
          .select('id'),
      )
    }

    const results = await Promise.all(requests)
    const error = results.find((result) => result.error)?.error
    const changedCount = results.reduce((sum, result) => sum + (result.data?.length ?? 0), 0)

    setSavingKey('')
    if (error) return showMessage(error.message, 'error')
    if (changedCount !== targets.length) return showMessage('Not every prize was updated. Please refresh and try again.', 'error')

    showMessage(received ? `${changedCount} prize${changedCount === 1 ? '' : 's'} marked received.` : 'Prize returned to the outstanding list.', 'success')
    await loadData()
  }

  if (loading && !session) return <main className="login-wrap"><div className="card login-card">Loading Prize Fulfillment…</div></main>

  if (!session) {
    return <main className="login-wrap"><section className="card login-card"><h1>Prize Fulfillment</h1><p className="subtle">Sign in through Juanita Hub to continue.</p><Link className="primary" style={{ display: 'inline-block', textDecoration: 'none' }} href="/">Go to sign in</Link></section></main>
  }

  if (!profile?.active) {
    return <main className="login-wrap"><section className="card login-card"><h1>Prize Fulfillment</h1><div className="notice">Your staff account must be approved before prize fulfillment is available.</div><Link className="ghost" style={{ display: 'inline-block', textDecoration: 'none' }} href="/">Back to Juanita Hub</Link></section></main>
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Juanita Hub<small>Prize Fulfillment</small></div>
        <div className="toolbar"><span>{profile.display_name} <span className="badge">{profile.role}</span></span><Link className="ghost" style={{ textDecoration: 'none' }} href="/rewards">Reward Center</Link></div>
      </header>

      <main className="main fulfillment-page">
        <section className="fulfillment-hero">
          <div><span className="fulfillment-kicker">Reward handoff</span><h1>Prize Fulfillment</h1><p>See what children won and check prizes off when they receive them.</p></div>
          <div className="fulfillment-month-control"><label htmlFor="fulfillment-month">Reward month</label><input id="fulfillment-month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /><button className="ghost" type="button" onClick={() => setMonth((current) => shiftMonth(current, -1))}>Previous month</button></div>
        </section>

        {message && <div className={`notice fulfillment-notice ${messageKind}`}>{message}</div>}

        <section className="fulfillment-summary" aria-label="Prize fulfillment summary">
          <article><small>{monthLabel(month)}</small><strong>{summary.total}</strong><span>Total prizes won</span></article>
          <article className={summary.outstanding ? 'attention' : ''}><small>Still to give out</small><strong>{summary.outstanding}</strong><span>Outstanding prizes</span></article>
          <article><small>Completed</small><strong>{summary.received}</strong><span>Marked received</span></article>
          <article><small>Children</small><strong>{summary.children}</strong><span>Prize recipients</span></article>
        </section>

        <section className="card fulfillment-controls">
          <div className="fulfillment-filters" role="group" aria-label="Fulfillment filter">
            <button className={filter === 'outstanding' ? 'active' : ''} onClick={() => setFilter('outstanding')}>Needs delivery <span>{summary.outstanding}</span></button>
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All <span>{summary.total}</span></button>
            <button className={filter === 'received' ? 'active' : ''} onClick={() => setFilter('received')}>Received <span>{summary.received}</span></button>
          </div>
          <label className="fulfillment-search"><span className="sr-only">Search prizes</span><input type="search" placeholder="Search child or prize…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        </section>

        <section className="fulfillment-list" aria-live="polite">
          {!loading && grouped.length === 0 && (
            <div className="card fulfillment-empty">
              <span aria-hidden="true">🎁</span>
              <h2>{rows.length === 0 ? `No prizes were recorded for ${monthLabel(month)}` : 'Nothing matches this view'}</h2>
              <p>{rows.length === 0 ? 'Prize wins will appear here automatically after the wheel is used.' : 'Try another filter or search term.'}</p>
            </div>
          )}

          {grouped.map((group) => {
            const outstanding = group.rows.filter((row) => !row.received_at)
            return (
              <article className="card fulfillment-child" key={group.child_id}>
                <header>
                  <div><span className="fulfillment-avatar" aria-hidden="true">🎁</span><span><h2>{group.name}</h2><small>{group.rows.length} prize{group.rows.length === 1 ? '' : 's'} in this view{outstanding.length ? ` • ${outstanding.length} still to give` : ' • all received'}</small></span></div>
                  {outstanding.length > 1 && <button className="primary" type="button" disabled={Boolean(savingKey)} onClick={() => void updateRows(outstanding, true)}>{savingKey === `child-${group.child_id}` ? 'Saving…' : 'Mark all received'}</button>}
                </header>

                <div className="fulfillment-prizes">
                  {group.rows.map((row) => {
                    const key = `${row.source}-${row.win_id}`
                    return (
                      <div className={`fulfillment-prize-row ${row.received_at ? 'received' : 'outstanding'}`} key={key}>
                        <button
                          className="fulfillment-check"
                          type="button"
                          aria-label={row.received_at ? `Mark ${row.prize_name} not received` : `Mark ${row.prize_name} received`}
                          disabled={Boolean(savingKey)}
                          onClick={() => void updateRows([row], !row.received_at)}
                        >
                          <span aria-hidden="true">{row.received_at ? '✓' : ''}</span>
                        </button>
                        <div className="fulfillment-prize-info">
                          <strong>{row.prize_name}</strong>
                          <span><em>{sourceLabel(row.source)}</em><small>{row.category_name} • {row.tier_name}</small>{row.reason && <small>Reason: {row.reason}</small>}</span>
                        </div>
                        <div className="fulfillment-prize-status">
                          {row.received_at ? <><strong>Received</strong><small>{dateTimeLabel(row.received_at)}</small></> : <><strong>Needs delivery</strong><small>Won {dateTimeLabel(row.won_at)}</small></>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </article>
            )
          })}
        </section>

        <section className="fulfillment-footnote"><strong>How this works:</strong> marking a prize received only records the handoff. It does not change the child’s spin history or return anything to prize inventory.</section>
      </main>
    </div>
  )
}
