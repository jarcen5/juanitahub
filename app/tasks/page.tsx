'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Profile = {
  user_id: string
  display_name: string
  role: 'staff' | 'admin'
  active: boolean
}

type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'
type TaskStatus = 'todo' | 'in_progress' | 'completed' | 'canceled'

type StaffTask = {
  id: number
  title: string
  details: string | null
  priority: TaskPriority
  status: TaskStatus
  due_date: string | null
  assigned_to: string
  created_by: string
  completed_by: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

const priorityLabels: Record<TaskPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}

const statusLabels: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  completed: 'Completed',
  canceled: 'Canceled',
}

const priorityWeight: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
}

function previousMonthStart() {
  const now = new Date()
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}-01`
}

function previousMonthLabel() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString(undefined, { month: 'long' })
}

function dateLabel(value: string | null) {
  if (!value) return 'No due date'
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function localToday() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

export default function TaskCenterPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [staff, setStaff] = useState<Profile[]>([])
  const [tasks, setTasks] = useState<StaffTask[]>([])
  const [prizeCount, setPrizeCount] = useState(0)
  const [registrationCount, setRegistrationCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [filter, setFilter] = useState<'open' | 'completed' | 'all'>('open')
  const [search, setSearch] = useState('')

  const [editingId, setEditingId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('normal')
  const [dueDate, setDueDate] = useState('')
  const [assignee, setAssignee] = useState('')

  useEffect(() => {
    let mounted = true
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      if (mounted) setSession(next)
    })
    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (session) void loadData()
    else setLoading(false)
  }, [session])

  async function loadData() {
    if (!session) return
    setLoading(true)
    setMessage('')

    const profileResult = await supabase
      .from('staff_profiles')
      .select('user_id,display_name,role,active')
      .eq('user_id', session.user.id)
      .maybeSingle()

    const currentProfile = profileResult.data as Profile | null
    setProfile(currentProfile)

    if (!currentProfile?.active) {
      setLoading(false)
      return
    }

    const [staffResult, taskResult, prizeResult] = await Promise.all([
      supabase
        .from('staff_profiles')
        .select('user_id,display_name,role,active')
        .eq('active', true)
        .order('display_name'),
      supabase
        .from('staff_tasks')
        .select('id,title,details,priority,status,due_date,assigned_to,created_by,completed_by,completed_at,created_at,updated_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('reward_prize_fulfillment')
        .select('win_id', { count: 'exact', head: true })
        .eq('month_start', previousMonthStart())
        .is('received_at', null),
    ])

    let registrationOutstanding = 0
    let registrationError: string | null = null
    if (currentProfile.role === 'admin') {
      const registrationResult = await supabase
        .from('registration_submissions')
        .select('id', { count: 'exact', head: true })
        .in('status', ['submitted', 'needs_review'])
      registrationOutstanding = registrationResult.count ?? 0
      registrationError = registrationResult.error?.message ?? null
    }

    setStaff((staffResult.data ?? []) as Profile[])
    setTasks((taskResult.data ?? []) as StaffTask[])
    setPrizeCount(prizeResult.count ?? 0)
    setRegistrationCount(registrationOutstanding)
    setAssignee((current) => current || session.user.id)

    const error = profileResult.error?.message
      ?? staffResult.error?.message
      ?? taskResult.error?.message
      ?? prizeResult.error?.message
      ?? registrationError
      ?? ''
    setMessage(error)
    setLoading(false)
  }

  function resetForm() {
    setEditingId(null)
    setTitle('')
    setDetails('')
    setPriority('normal')
    setDueDate('')
    setAssignee(session?.user.id ?? '')
  }

  function startEdit(task: StaffTask) {
    setEditingId(task.id)
    setTitle(task.title)
    setDetails(task.details ?? '')
    setPriority(task.priority)
    setDueDate(task.due_date ?? '')
    setAssignee(task.assigned_to)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveTask() {
    if (!session || !profile?.active || !title.trim() || saving) return
    if (profile.role !== 'admin' && assignee !== session.user.id) {
      setMessage('Staff can create personal tasks only. An admin can assign tasks to other people.')
      return
    }

    setSaving(true)
    setMessage('')

    const payload = {
      title: title.trim(),
      details: details.trim() || null,
      priority,
      due_date: dueDate || null,
      assigned_to: profile.role === 'admin' ? assignee : session.user.id,
    }

    if (editingId) {
      if (profile.role !== 'admin') {
        setMessage('Only admins can edit task details after creation.')
        setSaving(false)
        return
      }

      const { error } = await supabase
        .from('staff_tasks')
        .update(payload)
        .eq('id', editingId)

      if (error) setMessage(error.message)
      else {
        setMessage('Task updated.')
        resetForm()
        await loadData()
      }
    } else {
      const { error } = await supabase
        .from('staff_tasks')
        .insert({ ...payload, created_by: session.user.id })

      if (error) setMessage(error.message)
      else {
        setMessage(profile.role === 'admin' && assignee !== session.user.id ? 'Task assigned.' : 'Task created.')
        resetForm()
        await loadData()
      }
    }

    setSaving(false)
  }

  async function changeStatus(task: StaffTask, nextStatus: TaskStatus) {
    if (!session || !profile?.active || saving) return
    setSaving(true)
    setMessage('')

    if (task.assigned_to === session.user.id && nextStatus !== 'canceled') {
      const { error } = await supabase.rpc('update_my_task_status', {
        p_task_id: task.id,
        p_status: nextStatus,
      })
      if (error) setMessage(error.message)
      else await loadData()
      setSaving(false)
      return
    }

    if (profile.role !== 'admin') {
      setMessage('Only the assignee or an admin can change this task.')
      setSaving(false)
      return
    }

    const { error } = await supabase
      .from('staff_tasks')
      .update({
        status: nextStatus,
        completed_at: nextStatus === 'completed' ? new Date().toISOString() : null,
        completed_by: nextStatus === 'completed' ? session.user.id : null,
      })
      .eq('id', task.id)

    if (error) setMessage(error.message)
    else await loadData()
    setSaving(false)
  }

  async function deleteTask(task: StaffTask) {
    if (profile?.role !== 'admin' || saving) return
    if (!confirm(`Delete “${task.title}”? This permanently removes the manual task.`)) return
    setSaving(true)
    setMessage('')
    const { error } = await supabase.from('staff_tasks').delete().eq('id', task.id)
    if (error) setMessage(error.message)
    else {
      if (editingId === task.id) resetForm()
      setMessage('Task removed.')
      await loadData()
    }
    setSaving(false)
  }

  const staffMap = useMemo(() => new Map(staff.map((person) => [person.user_id, person.display_name])), [staff])

  const visibleTasks = useMemo(() => {
    if (!session) return []
    const term = search.trim().toLowerCase()
    return tasks
      .filter((task) => scope === 'all' && profile?.role === 'admin' ? true : task.assigned_to === session.user.id)
      .filter((task) => filter === 'open' ? !['completed', 'canceled'].includes(task.status) : filter === 'completed' ? task.status === 'completed' : true)
      .filter((task) => !term || task.title.toLowerCase().includes(term) || (task.details ?? '').toLowerCase().includes(term) || (staffMap.get(task.assigned_to) ?? '').toLowerCase().includes(term))
      .sort((a, b) => {
        const aDone = ['completed', 'canceled'].includes(a.status) ? 1 : 0
        const bDone = ['completed', 'canceled'].includes(b.status) ? 1 : 0
        if (aDone !== bDone) return aDone - bDone
        const aDue = a.due_date ?? '9999-12-31'
        const bDue = b.due_date ?? '9999-12-31'
        if (aDue !== bDue) return aDue.localeCompare(bDue)
        if (priorityWeight[a.priority] !== priorityWeight[b.priority]) return priorityWeight[a.priority] - priorityWeight[b.priority]
        return b.created_at.localeCompare(a.created_at)
      })
  }, [tasks, scope, profile, session, filter, search, staffMap])

  const myOpenCount = useMemo(() => {
    if (!session) return 0
    return tasks.filter((task) => task.assigned_to === session.user.id && !['completed', 'canceled'].includes(task.status)).length
  }, [tasks, session])

  const systemCount = prizeCount > 0 ? 1 : 0
  const adminSystemCount = profile?.role === 'admin' && registrationCount > 0 ? 1 : 0
  const noSystemTasks = systemCount + adminSystemCount === 0
  const today = localToday()

  if (loading && !profile) return <main className="login-wrap"><div className="card login-card">Loading Task Center…</div></main>
  if (!session) return <main className="login-wrap"><div className="card login-card"><h1>Task Center</h1><p className="subtle">Sign in to Juanita Hub to continue.</p></div></main>
  if (!profile?.active) return <main className="login-wrap"><div className="card login-card"><h1>Task Center</h1><p className="subtle">An active staff account is required.</p></div></main>

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Juanita Hub<small>Task Center</small></div>
        <div className="toolbar"><span>{profile.display_name} <span className="badge">{profile.role}</span></span></div>
      </header>

      <main className="main task-center-page">
        <section className="hero task-center-hero">
          <div>
            <span className="task-kicker">Staff operations</span>
            <h1>Task Center</h1>
            <p className="subtle">Assign work, keep personal to-dos organized, and see live Juanita Hub items that still need attention.</p>
          </div>
          <div className="task-hero-counts">
            <div><strong>{myOpenCount}</strong><span>My open tasks</span></div>
            <div><strong>{systemCount + adminSystemCount}</strong><span>System items</span></div>
          </div>
        </section>

        {message && <div className="notice">{message}</div>}

        <section className="task-layout">
          <div className="task-main-column">
            <section className="card task-system-card">
              <div className="task-section-heading">
                <div><span className="task-kicker">Live from Juanita Hub</span><h2>Needs attention</h2></div>
                <span className="task-system-pill">Automatic</span>
              </div>
              <div className="task-system-list">
                {prizeCount > 0 && (
                  <Link href="/rewards/fulfillment" className="task-system-item reward">
                    <span className="task-system-icon">🎁</span>
                    <span><strong>{prizeCount} {previousMonthLabel()} prize{prizeCount === 1 ? '' : 's'} still need{prizeCount === 1 ? 's' : ''} delivery</strong><small>Open Prize Fulfillment →</small></span>
                  </Link>
                )}
                {profile.role === 'admin' && registrationCount > 0 && (
                  <Link href="/registrations" className="task-system-item registration">
                    <span className="task-system-icon">📝</span>
                    <span><strong>{registrationCount} registration {registrationCount === 1 ? 'submission needs' : 'submissions need'} review</strong><small>Open Registration Center →</small></span>
                  </Link>
                )}
                {noSystemTasks && <div className="task-all-clear"><strong>✓ System work is caught up</strong><span>No prize-delivery or registration-review items are waiting right now.</span></div>}
              </div>
            </section>

            <section className="card task-list-card">
              <div className="task-section-heading task-list-heading">
                <div><span className="task-kicker">Manual work</span><h2>{scope === 'all' ? 'All tasks' : 'My tasks'}</h2></div>
                <span className="task-count-pill">{visibleTasks.length}</span>
              </div>

              <div className="task-filters">
                {profile.role === 'admin' && <div className="task-segmented"><button className={scope === 'mine' ? 'active' : ''} onClick={() => setScope('mine')}>Mine</button><button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>All staff</button></div>}
                <div className="task-segmented"><button className={filter === 'open' ? 'active' : ''} onClick={() => setFilter('open')}>Open</button><button className={filter === 'completed' ? 'active' : ''} onClick={() => setFilter('completed')}>Completed</button><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button></div>
                <input className="task-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks…" />
              </div>

              <div className="task-list">
                {visibleTasks.length === 0 && <div className="task-empty"><strong>No tasks here yet.</strong><span>{filter === 'open' ? 'Create a task or enjoy the clear list.' : 'Nothing matches this view.'}</span></div>}
                {visibleTasks.map((task) => {
                  const overdue = Boolean(task.due_date && task.due_date < today && !['completed', 'canceled'].includes(task.status))
                  const canChangeStatus = task.assigned_to === session.user.id || profile.role === 'admin'
                  return (
                    <article className={`task-item ${task.status} ${overdue ? 'overdue' : ''}`} key={task.id}>
                      <div className="task-item-top">
                        <div className="task-item-title">
                          <span className={`task-priority ${task.priority}`}>{priorityLabels[task.priority]}</span>
                          <h3>{task.title}</h3>
                        </div>
                        <span className={`task-status ${task.status}`}>{statusLabels[task.status]}</span>
                      </div>
                      {task.details && <p>{task.details}</p>}
                      <div className="task-meta">
                        <span>👤 {staffMap.get(task.assigned_to) ?? 'Staff member'}</span>
                        <span className={overdue ? 'task-overdue-label' : ''}>📅 {overdue ? 'Overdue • ' : ''}{dateLabel(task.due_date)}</span>
                      </div>
                      <div className="task-item-actions">
                        {canChangeStatus && !['completed', 'canceled'].includes(task.status) && (
                          <>
                            {task.status !== 'in_progress' && <button className="ghost" disabled={saving} onClick={() => void changeStatus(task, 'in_progress')}>Start</button>}
                            <button className="primary" disabled={saving} onClick={() => void changeStatus(task, 'completed')}>✓ Complete</button>
                          </>
                        )}
                        {canChangeStatus && task.status === 'completed' && <button className="ghost" disabled={saving} onClick={() => void changeStatus(task, 'todo')}>Reopen</button>}
                        {profile.role === 'admin' && <button className="ghost" disabled={saving} onClick={() => startEdit(task)}>Edit</button>}
                        {profile.role === 'admin' && !['completed', 'canceled'].includes(task.status) && <button className="ghost" disabled={saving} onClick={() => void changeStatus(task, 'canceled')}>Cancel</button>}
                        {profile.role === 'admin' && <button className="ghost danger-button" disabled={saving} onClick={() => void deleteTask(task)}>Delete</button>}
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          </div>

          <aside className="card task-editor-card">
            <div className="task-section-heading">
              <div><span className="task-kicker">{editingId ? 'Update work' : 'New work'}</span><h2>{editingId ? 'Edit task' : 'Create a task'}</h2></div>
              {editingId && <button className="ghost" onClick={resetForm}>Cancel edit</button>}
            </div>

            <div className="task-form">
              <label className="field"><span>Task title *</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} placeholder="What needs to be done?" /></label>
              <label className="field"><span>Notes</span><textarea rows={5} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Add context, instructions, or a checklist note…" /></label>
              <div className="task-form-grid">
                <label className="field"><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
                <label className="field"><span>Due date</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
              </div>

              <label className="field"><span>Assigned to</span>
                {profile.role === 'admin' ? (
                  <select value={assignee} onChange={(event) => setAssignee(event.target.value)}>
                    {staff.map((person) => <option key={person.user_id} value={person.user_id}>{person.display_name}{person.user_id === session.user.id ? ' (me)' : ''}</option>)}
                  </select>
                ) : (
                  <input value={profile.display_name} disabled />
                )}
              </label>

              {profile.role !== 'admin' && <p className="task-helper">Staff can create personal tasks and update their own status. Admins can assign work across the team.</p>}
              <button className="primary task-save-button" disabled={saving || !title.trim() || !assignee} onClick={() => void saveTask()}>{saving ? 'Saving…' : editingId ? 'Save changes' : profile.role === 'admin' && assignee !== session.user.id ? 'Assign task' : 'Create task'}</button>
            </div>
          </aside>
        </section>
      </main>
    </div>
  )
}
