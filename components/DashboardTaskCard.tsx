'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Task = {
  id: number
  title: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  status: 'todo' | 'in_progress' | 'completed' | 'canceled'
  due_date: string | null
}

const priorityWeight = { urgent: 0, high: 1, normal: 2, low: 3 } as const

function dateLabel(value: string | null) {
  if (!value) return 'No due date'
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function DashboardTaskCard() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let mounted = true
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user.id
      if (!userId) {
        if (mounted) setLoaded(true)
        return
      }

      const { data } = await supabase
        .from('staff_tasks')
        .select('id,title,priority,status,due_date')
        .eq('assigned_to', userId)
        .in('status', ['todo', 'in_progress'])

      if (!mounted) return
      setTasks((data ?? []) as Task[])
      setLoaded(true)
    }
    void load()
    return () => { mounted = false }
  }, [])

  const sorted = useMemo(() => [...tasks].sort((a, b) => {
    const aDue = a.due_date ?? '9999-12-31'
    const bDue = b.due_date ?? '9999-12-31'
    if (aDue !== bDue) return aDue.localeCompare(bDue)
    return priorityWeight[a.priority] - priorityWeight[b.priority]
  }), [tasks])

  return (
    <section className="card home-task-card">
      <div className="home-section-heading compact">
        <div><span className="home-section-kicker">Assigned work</span><h2>My Tasks</h2></div>
        <Link className="ghost" href="/tasks">Task Center →</Link>
      </div>
      {!loaded ? <div className="home-empty-state">Loading tasks…</div> : sorted.length === 0 ? (
        <div className="home-all-clear"><strong>✓ No manual tasks waiting</strong><small>Your assigned task list is clear.</small></div>
      ) : (
        <div className="home-task-list">
          {sorted.slice(0, 4).map((task) => (
            <Link href="/tasks" key={task.id} className="home-task-row">
              <span className={`home-task-priority ${task.priority}`} />
              <span><strong>{task.title}</strong><small>{task.status === 'in_progress' ? 'In progress' : 'To do'} • {dateLabel(task.due_date)}</small></span>
            </Link>
          ))}
          {sorted.length > 4 && <Link className="home-task-more" href="/tasks">+ {sorted.length - 4} more task{sorted.length - 4 === 1 ? '' : 's'}</Link>}
        </div>
      )}
    </section>
  )
}
