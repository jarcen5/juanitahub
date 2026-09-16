'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Profile = {
  display_name: string
  role: 'staff' | 'admin'
  active: boolean
}

type MonthlyReport = {
  month_start: string
  month_end: string
  open_days: number | string
  days_with_sign_ins: number | string
  child_sign_ins: number | string
  unique_children: number | string
  community_sign_ins: number | string
  total_sign_ins: number | string
  avg_children_per_open_day: number | string | null
  avg_community_per_open_day: number | string | null
  good_moods: number | string
  okay_moods: number | string
  hard_day_moods: number | string
}

type VisitRow = {
  service_date: string
  participant_type: 'child' | 'adult' | 'family' | 'visitor'
}

type OperatingRow = {
  service_date: string
  is_open: boolean
  reason: string | null
}

type DailyRow = {
  date: string
  isOpen: boolean | null
  reason: string | null
  children: number
  community: number
  total: number
}

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const start = `${year}-${String(monthNumber).padStart(2, '0')}-01`
  const endDate = new Date(year, monthNumber, 0)
  const end = `${year}-${String(monthNumber).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
  return { start, end }
}

function asNumber(value: number | string | null | undefined) {
  if (value == null || value === '') return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(year, monthNumber - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export default function AttendanceReportsPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [month, setMonth] = useState(currentMonth())
  const [report, setReport] = useState<MonthlyReport | null>(null)
  const [dailyRows, setDailyRows] = useState<DailyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    void loadReport()
  }, [session, month])

  async function loadReport() {
    if (!session) return
    setLoading(true)
    setMessage('')

    const { start, end } = monthBounds(month)
    const [profileResult, reportResult, visitsResult, operatingResult] = await Promise.all([
      supabase
        .from('staff_profiles')
        .select('display_name, role, active')
        .eq('user_id', session.user.id)
        .maybeSingle(),
      supabase.rpc('attendance_monthly_report', { p_month_start: start }),
      supabase
        .from('attendance_visits')
        .select('service_date, participant_type')
        .eq('status', 'active')
        .gte('service_date', start)
        .lte('service_date', end),
      supabase
        .from('operating_days')
        .select('service_date, is_open, reason')
        .gte('service_date', start)
        .lte('service_date', end)
        .order('service_date'),
    ])

    const error = profileResult.error ?? reportResult.error ?? visitsResult.error ?? operatingResult.error
    if (error) setMessage(error.message)

    setProfile(profileResult.data as Profile | null)
    setReport((((reportResult.data ?? []) as MonthlyReport[])[0]) ?? null)

    const rows = new Map<string, DailyRow>()
    ;((operatingResult.data ?? []) as OperatingRow[]).forEach((day) => {
      rows.set(day.service_date, {
        date: day.service_date,
        isOpen: day.is_open,
        reason: day.reason,
        children: 0,
        community: 0,
        total: 0,
      })
    })

    ;((visitsResult.data ?? []) as VisitRow[]).forEach((visit) => {
      const row = rows.get(visit.service_date) ?? {
        date: visit.service_date,
        isOpen: null,
        reason: null,
        children: 0,
        community: 0,
        total: 0,
      }

      if (visit.participant_type === 'child') row.children += 1
      else row.community += 1
      row.total += 1
      rows.set(visit.service_date, row)
    })

    setDailyRows([...rows.values()].sort((a, b) => a.date.localeCompare(b.date)))
    setLoading(false)
  }

  const metrics = useMemo(() => ({
    openDays: asNumber(report?.open_days),
    signInDays: asNumber(report?.days_with_sign_ins),
    childSignIns: asNumber(report?.child_sign_ins),
    uniqueChildren: asNumber(report?.unique_children),
    communitySignIns: asNumber(report?.community_sign_ins),
    totalSignIns: asNumber(report?.total_sign_ins),
    childAverage: report?.avg_children_per_open_day == null ? null : asNumber(report.avg_children_per_open_day),
    communityAverage: report?.avg_community_per_open_day == null ? null : asNumber(report.avg_community_per_open_day),
    goodMoods: asNumber(report?.good_moods),
    okayMoods: asNumber(report?.okay_moods),
    hardDayMoods: asNumber(report?.hard_day_moods),
  }), [report])

  function downloadCsv() {
    const lines = [
      ['Date', 'Center status', 'Child sign-ins', 'Community sign-ins', 'Total sign-ins'].join(','),
      ...dailyRows.map((row) => [
        row.date,
        row.isOpen === true ? 'Open' : row.isOpen === false ? 'Closed' : 'Not recorded',
        row.children,
        row.community,
        row.total,
      ].join(',')),
    ]

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `juanita-attendance-${month}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (loading && !session) {
    return <main className="login-wrap"><div className="card login-card">Loading attendance reports…</div></main>
  }

  if (!session) {
    return (
      <main className="login-wrap">
        <section className="card login-card"><h1>Attendance Reports</h1><p className="subtle">Sign in through Juanita Hub to view reports.</p></section>
      </main>
    )
  }

  if (!profile?.active) {
    return (
      <main className="login-wrap">
        <section className="card login-card"><h1>Attendance Reports</h1><div className="notice">Your staff account must be active to view attendance reports.</div></section>
      </main>
    )
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Juanita Hub<small>Attendance reports</small></div>
        <div className="toolbar"><span>{profile.display_name} <span className="badge">{profile.role}</span></span></div>
      </header>

      <main className="main reports-page">
        <section className="hero reports-hero">
          <div>
            <span className="reports-eyebrow">Automatic reporting</span>
            <h1>Attendance Reports</h1>
            <p className="subtle">Monthly child and community participation calculated directly from saved Juanita Hub sign-ins.</p>
          </div>
          <div className="reports-controls">
            <label className="field"><span>Report month</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
            <button type="button" className="ghost" onClick={downloadCsv} disabled={dailyRows.length === 0}>Export CSV</button>
          </div>
        </section>

        {message && <div className="notice">{message}</div>}

        <section className="card reports-summary-header">
          <div><span className="reports-eyebrow">Monthly summary</span><h2>{formatMonth(month)}</h2></div>
          <div className="reports-open-days"><strong>{metrics.openDays}</strong><span>recorded open days</span><small>Used as the denominator for daily averages</small></div>
        </section>

        {metrics.openDays === 0 && (
          <div className="notice reports-warning"><strong>No open days are recorded for this month yet.</strong> Totals can still appear, but daily averages will stay blank until operating days are recorded.</div>
        )}

        <section className="reports-metric-grid">
          <article className="card reports-metric"><span>Child sign-ins</span><strong>{metrics.childSignIns}</strong><small>{metrics.uniqueChildren} unique children</small></article>
          <article className="card reports-metric"><span>Community sign-ins</span><strong>{metrics.communitySignIns}</strong><small>Adults, families, and visitors</small></article>
          <article className="card reports-metric"><span>Total sign-ins</span><strong>{metrics.totalSignIns}</strong><small>Across {metrics.signInDays} day{metrics.signInDays === 1 ? '' : 's'} with activity</small></article>
          <article className="card reports-metric"><span>Avg. children / open day</span><strong>{metrics.childAverage == null ? '—' : metrics.childAverage.toFixed(2)}</strong><small>Uses recorded open days</small></article>
          <article className="card reports-metric"><span>Avg. community / open day</span><strong>{metrics.communityAverage == null ? '—' : metrics.communityAverage.toFixed(2)}</strong><small>Uses recorded open days</small></article>
        </section>

        <section className="reports-layout">
          <section className="card reports-daily-card">
            <div className="reports-section-heading"><div><span className="reports-eyebrow">Day by day</span><h2>Daily attendance</h2></div></div>
            <div className="reports-table-wrap">
              <table className="reports-table">
                <thead><tr><th>Date</th><th>Center</th><th>Children</th><th>Community</th><th>Total</th></tr></thead>
                <tbody>
                  {dailyRows.map((row) => (
                    <tr key={row.date}>
                      <td>{formatDate(row.date)}</td>
                      <td><span className={`reports-status ${row.isOpen === true ? 'open' : row.isOpen === false ? 'closed' : 'unknown'}`}>{row.isOpen === true ? 'Open' : row.isOpen === false ? 'Closed' : 'Not recorded'}</span></td>
                      <td>{row.children}</td><td>{row.community}</td><td><strong>{row.total}</strong></td>
                    </tr>
                  ))}
                  {dailyRows.length === 0 && <tr><td colSpan={5} className="reports-empty">No attendance or operating-day records for this month yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="card reports-mood-card">
            <span className="reports-eyebrow">Private staff aggregate</span>
            <h2>Mood sign-ins</h2>
            <p className="subtle">This report shows totals only. Individual mood selections remain inside the staff attendance workspace.</p>
            <div className="reports-moods">
              <div><span>😀</span><strong>{metrics.goodMoods}</strong><small>Good</small></div>
              <div><span>😐</span><strong>{metrics.okayMoods}</strong><small>Meh</small></div>
              <div><span>🙁</span><strong>{metrics.hardDayMoods}</strong><small>Not great</small></div>
            </div>
          </aside>
        </section>

        <section className="card reports-note">
          <strong>How averages work</strong>
          <p>Juanita Hub divides monthly sign-ins by the number of dates marked <em>open</em> in Attendance. Closed dates do not lower the average, and calendar days are never used automatically.</p>
        </section>
      </main>
    </div>
  )
}
