'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type StaffProfile = {
  display_name: string
  role: 'staff' | 'admin'
  active: boolean
}

type CalendarEventType = 'activity' | 'field_trip' | 'club' | 'program' | 'meeting' | 'closure' | 'special_event' | 'other'
type CalendarVisibility = 'public' | 'staff'
type CalendarView = 'week' | 'month'

type CalendarEvent = {
  id: number
  event_date: string
  title: string
  event_type: CalendarEventType
  description: string | null
  staff_notes: string | null
  location: string | null
  all_day: boolean
  start_time: string | null
  end_time: string | null
  visibility: CalendarVisibility
  status: 'scheduled' | 'canceled'
  series_id: string | null
  created_by: string
  canceled_by: string | null
  canceled_at: string | null
  created_at: string
  updated_at: string
}

type TeamMember = {
  id: number
  display_name: string
  member_type: 'staff' | 'intern' | 'volunteer'
  active: boolean
}

type StaffingBlock = {
  id: number
  team_member_id: number
  day_of_week: number
  block_type: 'shift' | 'available'
  start_time: string
  end_time: string
  program_id: number | null
  location: string | null
  effective_start: string | null
  effective_end: string | null
}

type StaffingException = {
  id: number
  team_member_id: number
  exception_date: string
  exception_type: 'off' | 'modified'
  start_time: string | null
  end_time: string | null
  note: string | null
}

type StaffingProgram = {
  id: number
  name: string
}

type StaffingItem = {
  key: string
  member_name: string
  member_type: TeamMember['member_type']
  kind: 'shift' | 'available' | 'off' | 'modified'
  start_time: string | null
  end_time: string | null
  program_name: string | null
  location: string | null
  note: string | null
}

type EventForm = {
  title: string
  event_type: CalendarEventType
  event_date: string
  all_day: boolean
  start_time: string
  end_time: string
  location: string
  visibility: CalendarVisibility
  description: string
  staff_notes: string
  repeat_weekly: boolean
  repeat_until: string
}

const eventTypes: Array<{ value: CalendarEventType; label: string; icon: string }> = [
  { value: 'activity', label: 'Activity', icon: '🎨' },
  { value: 'field_trip', label: 'Field Trip', icon: '🚌' },
  { value: 'club', label: 'Club', icon: '⭐' },
  { value: 'program', label: 'Program', icon: '📚' },
  { value: 'meeting', label: 'Meeting', icon: '👥' },
  { value: 'closure', label: 'Closure', icon: '🔒' },
  { value: 'special_event', label: 'Special Event', icon: '✨' },
  { value: 'other', label: 'Other', icon: '📌' },
]

function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function startOfWeek(date: Date) {
  return addDays(date, -date.getDay())
}

function endOfWeek(date: Date) {
  return addDays(startOfWeek(date), 6)
}

function monthGridStart(date: Date) {
  return startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1, 12))
}

function monthGridEnd(date: Date) {
  const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12)
  return endOfWeek(monthEnd)
}

function formatHeadingDate(date: Date) {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function formatWeekRange(date: Date) {
  const start = startOfWeek(date)
  const end = endOfWeek(date)
  const sameMonth = start.getMonth() === end.getMonth()
  if (sameMonth) {
    return `${start.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}–${end.getDate()}, ${end.getFullYear()}`
  }
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
}

function formatTime(value: string | null) {
  if (!value) return ''
  const [hourString, minuteString] = value.split(':')
  const hour = Number(hourString)
  const minute = Number(minuteString)
  const date = new Date(2000, 0, 1, hour, minute)
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function eventTimeLabel(event: CalendarEvent) {
  if (event.all_day) return 'All day'
  if (!event.start_time) return 'Time TBD'
  if (!event.end_time) return formatTime(event.start_time)
  return `${formatTime(event.start_time)}–${formatTime(event.end_time)}`
}

function eventMeta(type: CalendarEventType) {
  return eventTypes.find((item) => item.value === type) ?? eventTypes[eventTypes.length - 1]
}

function blankForm(date: string): EventForm {
  return {
    title: '',
    event_type: 'activity',
    event_date: date,
    all_day: false,
    start_time: '',
    end_time: '',
    location: '',
    visibility: 'public',
    description: '',
    staff_notes: '',
    repeat_weekly: false,
    repeat_until: date,
  }
}

export default function CalendarPage() {
  const today = localDateKey()
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [view, setView] = useState<CalendarView>('week')
  const [cursor, setCursor] = useState(() => parseDateKey(today))
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [staffingBlocks, setStaffingBlocks] = useState<StaffingBlock[]>([])
  const [staffingExceptions, setStaffingExceptions] = useState<StaffingException[]>([])
  const [staffingPrograms, setStaffingPrograms] = useState<StaffingProgram[]>([])
  const [showStaffing, setShowStaffing] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [form, setForm] = useState<EventForm>(() => blankForm(today))
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session)
        if (!data.session) setLoading(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session) {
      setProfile(null)
      return
    }

    let cancelled = false
    supabase
      .from('staff_profiles')
      .select('display_name, role, active')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        setProfile(data as StaffProfile | null)
        setMessage(error?.message ?? '')
        if (!data?.active) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [session])

  const range = useMemo(() => {
    const start = view === 'week' ? startOfWeek(cursor) : monthGridStart(cursor)
    const end = view === 'week' ? endOfWeek(cursor) : monthGridEnd(cursor)
    return { start, end, startKey: localDateKey(start), endKey: localDateKey(end) }
  }, [cursor, view])

  useEffect(() => {
    if (!session || !profile?.active) return
    void loadEvents()
  }, [session, profile?.active, range.startKey, range.endKey])

  async function loadEvents() {
    setLoading(true)
    const [eventResult, memberResult, blockResult, exceptionResult, programResult] = await Promise.all([
      supabase
        .from('calendar_events')
        .select('id, event_date, title, event_type, description, staff_notes, location, all_day, start_time, end_time, visibility, status, series_id, created_by, canceled_by, canceled_at, created_at, updated_at')
        .gte('event_date', range.startKey)
        .lte('event_date', range.endKey)
        .order('event_date')
        .order('start_time'),
      supabase
        .from('team_members')
        .select('id,display_name,member_type,active')
        .order('display_name'),
      supabase
        .from('team_schedule_blocks')
        .select('id,team_member_id,day_of_week,block_type,start_time,end_time,program_id,location,effective_start,effective_end')
        .order('day_of_week')
        .order('start_time'),
      supabase
        .from('team_schedule_exceptions')
        .select('id,team_member_id,exception_date,exception_type,start_time,end_time,note')
        .gte('exception_date', range.startKey)
        .lte('exception_date', range.endKey)
        .order('exception_date'),
      supabase
        .from('programs')
        .select('id,name'),
    ])

    setEvents((eventResult.data ?? []) as CalendarEvent[])
    setTeamMembers((memberResult.data ?? []) as TeamMember[])
    setStaffingBlocks((blockResult.data ?? []) as StaffingBlock[])
    setStaffingExceptions((exceptionResult.data ?? []) as StaffingException[])
    setStaffingPrograms((programResult.data ?? []) as StaffingProgram[])
    setMessage(
      eventResult.error?.message
      ?? memberResult.error?.message
      ?? blockResult.error?.message
      ?? exceptionResult.error?.message
      ?? programResult.error?.message
      ?? '',
    )
    setLoading(false)
  }

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const dayEvents = map.get(event.event_date) ?? []
      dayEvents.push(event)
      map.set(event.event_date, dayEvents)
    }

    for (const dayEvents of map.values()) {
      dayEvents.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'scheduled' ? -1 : 1
        if (a.all_day !== b.all_day) return a.all_day ? -1 : 1
        return (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99')
      })
    }
    return map
  }, [events])

  const staffingByDate = useMemo(() => {
    const map = new Map<string, StaffingItem[]>()
    const programMap = new Map(staffingPrograms.map((program) => [program.id, program.name]))
    const exceptionMap = new Map(staffingExceptions.map((item) => [`${item.team_member_id}:${item.exception_date}`, item]))

    for (let day = new Date(range.start); day <= range.end; day = addDays(day, 1)) {
      const dateKey = localDateKey(day)
      const dayItems: StaffingItem[] = []
      const dayOfWeek = day.getDay()

      for (const member of teamMembers) {
        const exception = exceptionMap.get(`${member.id}:${dateKey}`)
        if (exception) {
          dayItems.push({
            key: `exception-${exception.id}`,
            member_name: member.display_name,
            member_type: member.member_type,
            kind: exception.exception_type,
            start_time: exception.start_time,
            end_time: exception.end_time,
            program_name: null,
            location: null,
            note: exception.note,
          })
          continue
        }

        for (const block of staffingBlocks) {
          if (block.team_member_id !== member.id || block.day_of_week !== dayOfWeek) continue
          if (block.effective_start && dateKey < block.effective_start) continue
          if (block.effective_end && dateKey > block.effective_end) continue
          dayItems.push({
            key: `block-${block.id}-${dateKey}`,
            member_name: member.display_name,
            member_type: member.member_type,
            kind: block.block_type,
            start_time: block.start_time,
            end_time: block.end_time,
            program_name: block.program_id ? programMap.get(block.program_id) ?? null : null,
            location: block.location,
            note: null,
          })
        }
      }

      dayItems.sort((a, b) => (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99') || a.member_name.localeCompare(b.member_name))
      map.set(dateKey, dayItems)
    }
    return map
  }, [teamMembers, staffingBlocks, staffingExceptions, staffingPrograms, range.startKey, range.endKey])

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(cursor), index)), [cursor])
  const monthDays = useMemo(() => {
    const start = monthGridStart(cursor)
    const end = monthGridEnd(cursor)
    const days: Date[] = []
    for (let day = new Date(start); day <= end; day = addDays(day, 1)) days.push(day)
    return days
  }, [cursor])

  function openNewEvent(date = localDateKey(cursor)) {
    setEditingEvent(null)
    setSelectedEvent(null)
    setForm(blankForm(date))
    setFormOpen(true)
    setMessage('')
  }

  function openEditEvent(event: CalendarEvent) {
    setEditingEvent(event)
    setSelectedEvent(null)
    setForm({
      title: event.title,
      event_type: event.event_type,
      event_date: event.event_date,
      all_day: event.all_day,
      start_time: event.start_time?.slice(0, 5) ?? '',
      end_time: event.end_time?.slice(0, 5) ?? '',
      location: event.location ?? '',
      visibility: event.visibility,
      description: event.description ?? '',
      staff_notes: event.staff_notes ?? '',
      repeat_weekly: false,
      repeat_until: event.event_date,
    })
    setFormOpen(true)
  }

  function shiftCalendar(direction: number) {
    const next = new Date(cursor)
    if (view === 'week') next.setDate(next.getDate() + direction * 7)
    else next.setMonth(next.getMonth() + direction)
    setCursor(next)
  }

  async function saveEvent() {
    if (!session || profile?.role !== 'admin' || saving) return
    const title = form.title.trim()
    if (!title) {
      setMessage('Enter an event title.')
      return
    }
    if (!form.event_date) {
      setMessage('Choose an event date.')
      return
    }
    if (!form.all_day && form.start_time && form.end_time && form.end_time <= form.start_time) {
      setMessage('The end time must be later than the start time.')
      return
    }

    setSaving(true)
    setMessage('')

    const baseRecord = {
      title,
      event_type: form.event_type,
      all_day: form.all_day,
      start_time: form.all_day || !form.start_time ? null : form.start_time,
      end_time: form.all_day || !form.end_time ? null : form.end_time,
      location: form.location.trim() || null,
      visibility: form.visibility,
      description: form.description.trim() || null,
      staff_notes: form.staff_notes.trim() || null,
    }

    if (editingEvent) {
      const { error } = await supabase
        .from('calendar_events')
        .update({ ...baseRecord, event_date: form.event_date })
        .eq('id', editingEvent.id)

      if (error) {
        setMessage(error.message)
        setSaving(false)
        return
      }
    } else {
      const dates = [form.event_date]
      if (form.repeat_weekly) {
        if (!form.repeat_until || form.repeat_until < form.event_date) {
          setMessage('Choose a repeat-through date on or after the first event date.')
          setSaving(false)
          return
        }

        let next = addDays(parseDateKey(form.event_date), 7)
        const repeatEnd = parseDateKey(form.repeat_until)
        while (next <= repeatEnd && dates.length < 52) {
          dates.push(localDateKey(next))
          next = addDays(next, 7)
        }
      }

      const seriesId = dates.length > 1 ? crypto.randomUUID() : null
      const rows = dates.map((eventDate) => ({
        ...baseRecord,
        event_date: eventDate,
        series_id: seriesId,
        created_by: session.user.id,
      }))

      const { error } = await supabase.from('calendar_events').insert(rows)
      if (error) {
        setMessage(error.message)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setFormOpen(false)
    setEditingEvent(null)
    setMessage(editingEvent ? 'Calendar event updated.' : 'Calendar event added.')
    setCursor(parseDateKey(form.event_date))
    await loadEvents()
  }

  async function setEventCanceled(event: CalendarEvent, canceled: boolean) {
    if (!session || profile?.role !== 'admin' || saving) return
    if (canceled && !window.confirm(`Cancel “${event.title}”? The event will stay on the calendar marked as canceled.`)) return

    setSaving(true)
    const { error } = await supabase
      .from('calendar_events')
      .update(canceled ? {
        status: 'canceled',
        canceled_by: session.user.id,
        canceled_at: new Date().toISOString(),
      } : {
        status: 'scheduled',
        canceled_by: null,
        canceled_at: null,
      })
      .eq('id', event.id)

    setSaving(false)
    if (error) {
      setMessage(error.message)
      return
    }

    setSelectedEvent(null)
    setMessage(canceled ? 'Event canceled. It remains in the calendar history.' : 'Event restored to the calendar.')
    await loadEvents()
  }

  async function deleteEvent(event: CalendarEvent, deleteSeries = false) {
    if (!session || profile?.role !== 'admin' || saving) return

    const dateLabel = parseDateKey(event.event_date).toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    const target = deleteSeries && event.series_id
      ? `the entire recurring series for “${event.title}”`
      : `“${event.title}” on ${dateLabel}`

    if (!window.confirm(`Permanently delete ${target}? This cannot be undone. Use Cancel event instead if you want to keep a record that it was planned.`)) return

    setSaving(true)
    setMessage('')

    let query = supabase.from('calendar_events').delete()
    query = deleteSeries && event.series_id
      ? query.eq('series_id', event.series_id)
      : query.eq('id', event.id)

    const { error } = await query
    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setSelectedEvent(null)
    setMessage(deleteSeries && event.series_id ? 'Recurring event series permanently deleted.' : 'Calendar event permanently deleted.')
    await loadEvents()
  }

  function renderEvent(event: CalendarEvent, compact = false) {
    const meta = eventMeta(event.event_type)
    return (
      <button
        type="button"
        className={`calendar-event-card type-${event.event_type} ${event.status === 'canceled' ? 'canceled' : ''} ${compact ? 'compact' : ''}`}
        key={event.id}
        onClick={() => setSelectedEvent(event)}
      >
        <span className="calendar-event-icon" aria-hidden="true">{meta.icon}</span>
        <span className="calendar-event-copy">
          <small>{eventTimeLabel(event)}{event.visibility === 'staff' ? ' • Staff only' : ''}</small>
          <strong>{event.title}</strong>
          {!compact && event.location && <span>{event.location}</span>}
          {event.status === 'canceled' && <em>Canceled</em>}
        </span>
      </button>
    )
  }

  if (loading && !session) {
    return <main className="login-wrap"><div className="card login-card">Loading Calendar…</div></main>
  }

  if (!session) {
    return <main className="login-wrap"><section className="card login-card"><h1>Calendar</h1><p className="subtle">Sign in through Juanita Hub to view the center calendar.</p></section></main>
  }

  if (!profile?.active) {
    return <main className="login-wrap"><section className="card login-card"><h1>Calendar</h1><div className="notice">Your staff account must be active before the calendar is available.</div></section></main>
  }

  const heading = view === 'week' ? formatWeekRange(cursor) : formatHeadingDate(cursor)

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Juanita Hub<small>Center Calendar</small></div>
        <div className="toolbar"><span>{profile.display_name} <span className="badge">{profile.role}</span></span></div>
      </header>

      <main className="main calendar-page">
        <section className="hero calendar-hero">
          <div>
            <span className="calendar-eyebrow">Plan the week</span>
            <h1>Center Calendar</h1>
            <p className="subtle">Plan activities, field trips, clubs, programs, meetings, closures, and special events in one shared place.</p>
          </div>
          {profile.role === 'admin' && <button type="button" className="primary calendar-new-button" onClick={() => openNewEvent(today)}>+ New event</button>}
        </section>

        {message && <div className="notice">{message}</div>}

        <section className="card calendar-toolbar">
          <div className="calendar-nav-buttons">
            <button type="button" className="ghost" onClick={() => shiftCalendar(-1)} aria-label={`Previous ${view}`}>←</button>
            <button type="button" className="ghost" onClick={() => setCursor(parseDateKey(today))}>Today</button>
            <button type="button" className="ghost" onClick={() => shiftCalendar(1)} aria-label={`Next ${view}`}>→</button>
          </div>
          <h2>{heading}</h2>
          <div className="calendar-view-switch" role="group" aria-label="Calendar view">
            <button type="button" className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Week</button>
            <button type="button" className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Month</button>
          </div>
        </section>

        <section className="card calendar-layer-bar">
          <label className="calendar-layer-toggle"><input type="checkbox" checked={showStaffing} onChange={(event) => setShowStaffing(event.target.checked)} /><span><strong>Staffing layer</strong><small>Private staff/intern/volunteer schedules • never shown on the public kiosk</small></span></label>
          <a className="ghost" href="/team">Manage team & scheduling →</a>
        </section>

        {loading ? (
          <section className="card calendar-loading">Loading calendar events…</section>
        ) : view === 'week' ? (
          <section className="calendar-week-grid">
            {weekDays.map((day) => {
              const key = localDateKey(day)
              const dayEvents = eventsByDate.get(key) ?? []
              const isToday = key === today
              return (
                <article className={`card calendar-day-column ${isToday ? 'today' : ''}`} key={key}>
                  <header>
                    <span>{day.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                    <strong>{day.getDate()}</strong>
                    {isToday && <small>Today</small>}
                  </header>
                  <div className="calendar-day-events">
                    {dayEvents.map((event) => renderEvent(event))}
                    {dayEvents.length === 0 && <div className="calendar-empty-day">No events planned</div>}
                  </div>
                  {showStaffing && (staffingByDate.get(key)?.length ?? 0) > 0 && <div className="calendar-staffing-day">
                    <span className="calendar-staffing-label">Staffing</span>
                    {(staffingByDate.get(key) ?? []).map((item) => <div className={`calendar-staffing-chip ${item.kind}`} key={item.key}>
                      <strong>{item.member_name}</strong>
                      <small>{item.kind === 'off' ? 'Off' : `${item.start_time ? timeLabel(item.start_time) : ''}${item.end_time ? `–${timeLabel(item.end_time)}` : ''}${item.kind === 'available' ? ' • available' : item.kind === 'modified' ? ' • modified' : ''}`}</small>
                      {item.program_name && <span>{item.program_name}</span>}
                    </div>)}
                  </div>}
                  {profile.role === 'admin' && <button type="button" className="calendar-add-day" onClick={() => openNewEvent(key)}>+ Add</button>}
                </article>
              )
            })}
          </section>
        ) : (
          <section className="card calendar-month-wrap">
            <div className="calendar-month-weekdays" aria-hidden="true">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="calendar-month-grid">
              {monthDays.map((day) => {
                const key = localDateKey(day)
                const dayEvents = eventsByDate.get(key) ?? []
                const inMonth = day.getMonth() === cursor.getMonth()
                const isToday = key === today
                return (
                  <article className={`calendar-month-day ${inMonth ? '' : 'outside'} ${isToday ? 'today' : ''}`} key={key}>
                    <button type="button" className="calendar-month-date" onClick={() => profile.role === 'admin' && openNewEvent(key)} title={profile.role === 'admin' ? 'Add an event on this date' : undefined}>
                      <span>{day.getDate()}</span>{isToday && <small>Today</small>}
                    </button>
                    <div className="calendar-month-events">
                      {dayEvents.slice(0, 3).map((event) => renderEvent(event, true))}
                      {dayEvents.length > 3 && <button type="button" className="calendar-more" onClick={() => { setCursor(day); setView('week') }}>+{dayEvents.length - 3} more</button>}
                      {showStaffing && (staffingByDate.get(key)?.length ?? 0) > 0 && <button type="button" className="calendar-staffing-summary" onClick={() => { setCursor(day); setView('week') }}>👥 {(staffingByDate.get(key) ?? []).length} staffing</button>}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )}

        <section className="card calendar-legend">
          <div><strong>Calendar visibility</strong><span><b>Public</b> events can appear on the kiosk welcome board. <b>Staff only</b> events stay inside the staff side of Juanita Hub.</span></div>
          <div><strong>Private staffing layer</strong><span>Recurring staff, intern, and volunteer schedules plus one-off exceptions can be shown here for signed-in staff without mixing staffing information into public center events.</span></div>
        </section>
      </main>

      {formOpen && profile.role === 'admin' && (
        <div className="calendar-modal-backdrop" role="presentation" onClick={() => !saving && setFormOpen(false)}>
          <section className="calendar-modal card" role="dialog" aria-modal="true" aria-labelledby="calendar-form-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="calendar-modal-close" onClick={() => !saving && setFormOpen(false)} aria-label="Close">×</button>
            <span className="calendar-eyebrow">{editingEvent ? 'Edit plan' : 'New plan'}</span>
            <h2 id="calendar-form-title">{editingEvent ? 'Edit calendar event' : 'Add calendar event'}</h2>
            {editingEvent?.series_id && <div className="calendar-series-note">This edits this date only. Series-wide editing can be added later.</div>}

            <div className="calendar-form-grid">
              <label className="field calendar-field-wide"><span>Event title</span><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Example: Museum field trip" autoFocus /></label>
              <label className="field"><span>Type</span><select value={form.event_type} onChange={(event) => setForm((current) => ({ ...current, event_type: event.target.value as CalendarEventType }))}>{eventTypes.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}</select></label>
              <label className="field"><span>Date</span><input type="date" value={form.event_date} onChange={(event) => setForm((current) => ({ ...current, event_date: event.target.value, repeat_until: current.repeat_until < event.target.value ? event.target.value : current.repeat_until }))} /></label>
              <label className="calendar-checkbox"><input type="checkbox" checked={form.all_day} onChange={(event) => setForm((current) => ({ ...current, all_day: event.target.checked }))} /><span>All-day event</span></label>
              {!form.all_day && <><label className="field"><span>Start time</span><input type="time" value={form.start_time} onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))} /></label><label className="field"><span>End time</span><input type="time" value={form.end_time} onChange={(event) => setForm((current) => ({ ...current, end_time: event.target.value }))} /></label></>}
              <label className="field"><span>Location</span><input value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} placeholder="Center, gym, museum…" /></label>
              <label className="field"><span>Visibility</span><select value={form.visibility} onChange={(event) => setForm((current) => ({ ...current, visibility: event.target.value as CalendarVisibility }))}><option value="public">Public / kiosk-safe</option><option value="staff">Staff only</option></select></label>
              <label className="field calendar-field-wide"><span>Description</span><textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={3} placeholder="Details staff and, for public events, the kiosk may show." /></label>
              <label className="field calendar-field-wide"><span>Private staff notes</span><textarea value={form.staff_notes} onChange={(event) => setForm((current) => ({ ...current, staff_notes: event.target.value }))} rows={2} placeholder="Optional internal notes. Never shown on the kiosk." /></label>
            </div>

            {!editingEvent && <div className="calendar-repeat-box"><label className="calendar-checkbox"><input type="checkbox" checked={form.repeat_weekly} onChange={(event) => setForm((current) => ({ ...current, repeat_weekly: event.target.checked }))} /><span>Repeat weekly</span></label>{form.repeat_weekly && <label className="field"><span>Repeat through</span><input type="date" min={form.event_date} value={form.repeat_until} onChange={(event) => setForm((current) => ({ ...current, repeat_until: event.target.value }))} /></label>}</div>}

            <div className="calendar-modal-actions">
              <button type="button" className="ghost" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</button>
              <button type="button" className="primary" onClick={() => void saveEvent()} disabled={saving}>{saving ? 'Saving…' : editingEvent ? 'Save changes' : form.repeat_weekly ? 'Add recurring events' : 'Add event'}</button>
            </div>
          </section>
        </div>
      )}

      {selectedEvent && (
        <div className="calendar-modal-backdrop" role="presentation" onClick={() => setSelectedEvent(null)}>
          <section className="calendar-modal calendar-detail card" role="dialog" aria-modal="true" aria-labelledby="calendar-detail-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="calendar-modal-close" onClick={() => setSelectedEvent(null)} aria-label="Close">×</button>
            <span className="calendar-detail-icon" aria-hidden="true">{eventMeta(selectedEvent.event_type).icon}</span>
            <span className="calendar-eyebrow">{eventMeta(selectedEvent.event_type).label}</span>
            <h2 id="calendar-detail-title">{selectedEvent.title}</h2>
            {selectedEvent.status === 'canceled' && <div className="calendar-canceled-banner">Canceled</div>}
            <div className="calendar-detail-facts">
              <div><small>Date</small><strong>{parseDateKey(selectedEvent.event_date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</strong></div>
              <div><small>Time</small><strong>{eventTimeLabel(selectedEvent)}</strong></div>
              <div><small>Location</small><strong>{selectedEvent.location || 'Not specified'}</strong></div>
              <div><small>Visibility</small><strong>{selectedEvent.visibility === 'public' ? 'Public / kiosk-safe' : 'Staff only'}</strong></div>
            </div>
            {selectedEvent.description && <div className="calendar-detail-section"><small>Description</small><p>{selectedEvent.description}</p></div>}
            {selectedEvent.staff_notes && <div className="calendar-detail-section staff-notes"><small>Private staff notes</small><p>{selectedEvent.staff_notes}</p></div>}
            <div className="calendar-modal-actions">
              <button type="button" className="ghost" onClick={() => setSelectedEvent(null)}>Close</button>
              {profile.role === 'admin' && <>
                <button type="button" className="ghost" onClick={() => openEditEvent(selectedEvent)} disabled={saving}>Edit</button>
                <button type="button" className={`ghost ${selectedEvent.status === 'scheduled' ? 'danger-button' : ''}`} onClick={() => void setEventCanceled(selectedEvent, selectedEvent.status === 'scheduled')} disabled={saving}>{selectedEvent.status === 'scheduled' ? 'Cancel event' : 'Restore event'}</button>
                <button type="button" className="ghost danger-button" onClick={() => void deleteEvent(selectedEvent)} disabled={saving}>Delete permanently</button>
                {selectedEvent.series_id && <button type="button" className="ghost danger-button" onClick={() => void deleteEvent(selectedEvent, true)} disabled={saving}>Delete recurring series</button>}
              </>}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
