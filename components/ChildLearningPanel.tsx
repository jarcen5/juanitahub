'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AssignmentCompletionDialog from '@/components/AssignmentCompletionDialog'

type Assignment = {
  id: number
  title: string
  subject: 'reading' | 'writing' | 'grammar' | 'typing' | 'math' | 'general'
  skill: string | null
  grade_levels: string[]
  delivery_format: 'digital' | 'printable' | 'either'
  active: boolean
}

type StudentAssignment = {
  id: number
  assignment_id: number
  week_start: string
  due_date: string | null
  status: 'assigned' | 'in_progress' | 'completed' | 'skipped'
  completed_at: string | null
  score: number | null
  max_score: number | null
  minutes_spent: number | null
  staff_note: string | null
}

type ReadingLog = {
  id: number
  read_on: string
  title: string | null
  minutes: number
}

type LearningNote = {
  id: number
  note_date: string
  note: string
}

type Props = {
  childId: number
  childName: string
  grade: string | null
  userId: string
}

const subjectLabels: Record<Assignment['subject'], string> = {
  reading: 'Reading',
  writing: 'Writing',
  grammar: 'Grammar',
  typing: 'Typing',
  math: 'Math',
  general: 'General',
}

const subjectIcons: Record<Assignment['subject'], string> = {
  reading: '📖',
  writing: '✍️',
  grammar: '🔤',
  typing: '⌨️',
  math: '➗',
  general: '📘',
}

function localDate() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

function mondayFor(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const weekday = date.getDay()
  const offset = weekday === 0 ? -6 : 1 - weekday
  date.setDate(date.getDate() + offset)
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

function dateLabel(value: string) {
  return new Date(value + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function statusLabel(status: StudentAssignment['status']) {
  if (status === 'in_progress') return 'In progress'
  if (status === 'completed') return 'Completed'
  if (status === 'skipped') return 'Skipped'
  return 'Assigned'
}

export default function ChildLearningPanel({ childId, childName, grade, userId }: Props) {
  const currentWeek = mondayFor(localDate())
  const fourWeekStart = addDays(currentWeek, -21)

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [studentAssignments, setStudentAssignments] = useState<StudentAssignment[]>([])
  const [readingLogs, setReadingLogs] = useState<ReadingLog[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null)
  const [dueDate, setDueDate] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [completionTarget, setCompletionTarget] = useState<StudentAssignment | null>(null)

  useEffect(() => {
    void loadLearning()
  }, [childId])

  async function loadLearning() {
    setLoading(true)
    setMessage('')
    const fourWeekEnd = addDays(currentWeek, 6)
    const [libraryResult, assignmentsResult, readingResult, notesResult] = await Promise.all([
      supabase.from('learning_assignments')
        .select('id, title, subject, skill, grade_levels, delivery_format, active')
        .eq('active', true)
        .order('subject')
        .order('title'),
      supabase.from('learning_student_assignments')
        .select('id, assignment_id, week_start, due_date, status, completed_at, score, max_score, minutes_spent, staff_note')
        .eq('child_id', childId)
        .gte('week_start', fourWeekStart)
        .lte('week_start', currentWeek)
        .order('week_start', { ascending: false })
        .order('id'),
      supabase.from('learning_reading_logs')
        .select('id, read_on, title, minutes')
        .eq('child_id', childId)
        .gte('read_on', fourWeekStart)
        .lte('read_on', fourWeekEnd)
        .order('read_on', { ascending: false }),
      supabase.from('learning_staff_notes')
        .select('id, note_date, note')
        .eq('child_id', childId)
        .order('note_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    const error = libraryResult.error ?? assignmentsResult.error ?? readingResult.error ?? notesResult.error
    if (error) setMessage(error.message)

    const library = (libraryResult.data ?? []) as Assignment[]
    setAssignments(library)
    setStudentAssignments((assignmentsResult.data ?? []) as StudentAssignment[])
    setReadingLogs((readingResult.data ?? []) as ReadingLog[])
    setNotes((notesResult.data ?? []) as LearningNote[])

    const gradeMatches = grade
      ? library.filter((assignment) => assignment.grade_levels.length === 0 || assignment.grade_levels.includes(grade))
      : library
    setSelectedAssignmentId((current) =>
      current && library.some((assignment) => assignment.id === current)
        ? current
        : gradeMatches[0]?.id ?? library[0]?.id ?? null,
    )
    setLoading(false)
  }

  const assignmentById = useMemo(() => new Map(assignments.map((assignment) => [assignment.id, assignment])), [assignments])

  const thisWeekAssignments = useMemo(
    () => studentAssignments.filter((row) => row.week_start === currentWeek),
    [studentAssignments, currentWeek],
  )

  const availableAssignments = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const alreadyAssigned = new Set(thisWeekAssignments.map((row) => row.assignment_id))
    return assignments.filter((assignment) => {
      if (alreadyAssigned.has(assignment.id)) return false
      if (grade && assignment.grade_levels.length > 0 && !assignment.grade_levels.includes(grade)) return false
      if (!needle) return true
      return [assignment.title, assignment.skill ?? '', subjectLabels[assignment.subject]].join(' ').toLowerCase().includes(needle)
    })
  }, [assignments, thisWeekAssignments, grade, search])

  useEffect(() => {
    if (selectedAssignmentId && availableAssignments.some((assignment) => assignment.id === selectedAssignmentId)) return
    setSelectedAssignmentId(availableAssignments[0]?.id ?? null)
  }, [availableAssignments, selectedAssignmentId])

  const weeks = useMemo(() => [0, 1, 2, 3].map((index) => addDays(currentWeek, -7 * index)), [currentWeek])

  const weeklyProgress = useMemo(() => weeks.map((weekStart) => {
    const weekEnd = addDays(weekStart, 6)
    const work = studentAssignments.filter((row) => row.week_start === weekStart)
    const reading = readingLogs.filter((row) => row.read_on >= weekStart && row.read_on <= weekEnd)
    const completed = work.filter((row) => row.status === 'completed').length
    return {
      weekStart,
      assigned: work.length,
      completed,
      completion: work.length ? Math.round((completed / work.length) * 100) : 0,
      readingMinutes: reading.reduce((sum, row) => sum + Number(row.minutes), 0),
    }
  }), [weeks, studentAssignments, readingLogs])

  const fourWeekTotals = useMemo(() => {
    const assigned = studentAssignments.length
    const completed = studentAssignments.filter((row) => row.status === 'completed').length
    return {
      assigned,
      completed,
      completion: assigned ? Math.round((completed / assigned) * 100) : 0,
      readingMinutes: readingLogs.reduce((sum, row) => sum + Number(row.minutes), 0),
      activeWeeks: weeklyProgress.filter((week) => week.assigned > 0 || week.readingMinutes > 0).length,
    }
  }, [studentAssignments, readingLogs, weeklyProgress])

  async function quickAssign() {
    if (!selectedAssignmentId || saving) return
    setSaving(true)
    setMessage('')
    const { error } = await supabase.from('learning_student_assignments').insert({
      child_id: childId,
      assignment_id: selectedAssignmentId,
      week_start: currentWeek,
      due_date: dueDate || null,
      assigned_by: userId,
      updated_by: userId,
    })
    setSaving(false)

    if (error) {
      setMessage(error.code === '23505' ? 'That assignment is already on this student’s week.' : error.message)
      return
    }

    setMessage('Assignment added to ' + childName + '’s week.')
    setDueDate('')
    await loadLearning()
  }

  if (loading) {
    return <section className="children-profile-section child-learning-panel"><div className="children-empty-inline">Loading learning progress…</div></section>
  }

  return (
    <section className="children-profile-section child-learning-panel" id="child-learning-profile">
      <div className="children-section-title child-learning-title">
        <span>📘</span>
        <div><small>Learning</small><h3>Progress & weekly work</h3></div>
        <Link className="ghost child-learning-open-hub" href="/learning#week">Open Learning Hub</Link>
      </div>

      {message && <div className="notice child-learning-notice">{message}</div>}

      <div className="child-learning-summary">
        <div><strong>{fourWeekTotals.completion}%</strong><span>4-week completion</span><small>{fourWeekTotals.completed} of {fourWeekTotals.assigned} assignments</small></div>
        <div><strong>{fourWeekTotals.readingMinutes}</strong><span>Reading minutes</span><small>Across the last 4 weeks</small></div>
        <div><strong>{fourWeekTotals.activeWeeks}/4</strong><span>Active weeks</span><small>Assignments or reading logged</small></div>
      </div>

      <div className="child-learning-grid">
        <div className="child-learning-block">
          <div className="child-learning-block-heading">
            <div><small>This week</small><h4>{dateLabel(currentWeek)} – {dateLabel(addDays(currentWeek, 6))}</h4></div>
            <span>{thisWeekAssignments.filter((row) => row.status === 'completed').length}/{thisWeekAssignments.length} done</span>
          </div>

          <div className="child-learning-current-list">
            {thisWeekAssignments.map((row) => {
              const assignment = assignmentById.get(row.assignment_id)
              if (!assignment) return null
              return (
                <article key={row.id}>
                  <span className="child-learning-subject">{subjectIcons[assignment.subject]}</span>
                  <span className="child-learning-current-copy">
                    <strong>{assignment.title}</strong>
                    <small>{subjectLabels[assignment.subject]}{assignment.skill ? ' • ' + assignment.skill : ''}{row.due_date ? ' • Due ' + dateLabel(row.due_date) : ''}</small>
                    {row.status === 'completed' && (row.score != null || row.minutes_spent != null || row.staff_note) && <span className="child-learning-completion-meta">{row.score != null && row.max_score != null ? `Score ${row.score}/${row.max_score} • ${Math.round((row.score / row.max_score) * 100)}%` : ''}{row.score != null && row.max_score != null && row.minutes_spent != null ? ' • ' : ''}{row.minutes_spent != null ? row.minutes_spent + ' min' : ''}{(row.score != null || row.minutes_spent != null) && row.staff_note ? ' • ' : ''}{row.staff_note || ''}</span>}
                  </span>
                  <span className="child-learning-row-end">
                    <em className={'child-learning-status ' + row.status}>{statusLabel(row.status)}</em>
                    <button className={row.status === 'completed' ? 'ghost' : 'primary'} type="button" onClick={() => setCompletionTarget(row)}>{row.status === 'completed' ? 'Edit' : 'Complete'}</button>
                  </span>
                </article>
              )
            })}
            {thisWeekAssignments.length === 0 && <div className="children-empty-inline">No assignments have been added for this week yet.</div>}
          </div>
        </div>

        <div className="child-learning-block">
          <div className="child-learning-block-heading">
            <div><small>Quick assign</small><h4>Add to this week</h4></div>
          </div>
          {availableAssignments.length ? (
            <>
              <label className="field"><span>Find assignment</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title or skill…" /></label>
              <label className="field"><span>Assignment</span><select value={selectedAssignmentId ?? ''} onChange={(event) => setSelectedAssignmentId(Number(event.target.value))}>{availableAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{subjectLabels[assignment.subject]} — {assignment.title}</option>)}</select></label>
              <label className="field"><span>Due date <small>(optional)</small></span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
              <button className="primary" type="button" disabled={saving || !selectedAssignmentId} onClick={() => void quickAssign()}>{saving ? 'Assigning…' : 'Assign to ' + childName.split(' ')[0]}</button>
            </>
          ) : (
            <div className="children-empty-inline">{assignments.length ? 'All matching assignments are already on this week.' : 'The assignment library is empty. Add activities in Learning Hub first.'}</div>
          )}
        </div>
      </div>

      <div className="child-learning-progress-section">
        <div className="child-learning-block-heading"><div><small>Last 4 weeks</small><h4>Progress trend</h4></div></div>
        <div className="child-learning-week-grid">
          {weeklyProgress.map((week) => (
            <article key={week.weekStart} className={week.weekStart === currentWeek ? 'current' : ''}>
              <small>{week.weekStart === currentWeek ? 'This week' : dateLabel(week.weekStart)}</small>
              <strong>{week.completion}%</strong>
              <span>{week.completed}/{week.assigned} assignments</span>
              <em>{week.readingMinutes} reading min</em>
              <div className="child-learning-progress-track"><span style={{ width: week.completion + '%' }} /></div>
            </article>
          ))}
        </div>
      </div>

      <div className="child-learning-grid lower">
        <div className="child-learning-block">
          <div className="child-learning-block-heading"><div><small>Reading</small><h4>Recent reading</h4></div><span>{fourWeekTotals.readingMinutes} min</span></div>
          <div className="child-learning-mini-list">
            {readingLogs.slice(0, 5).map((log) => <article key={log.id}><span>📖</span><span><strong>{log.minutes} minutes{log.title ? ' • ' + log.title : ''}</strong><small>{dateLabel(log.read_on)}</small></span></article>)}
            {readingLogs.length === 0 && <div className="children-empty-inline">No reading logged in the last 4 weeks.</div>}
          </div>
        </div>

        <div className="child-learning-block">
          <div className="child-learning-block-heading"><div><small>Staff observations</small><h4>Recent learning notes</h4></div></div>
          <div className="child-learning-note-list">
            {notes.map((note) => <article key={note.id}><small>{dateLabel(note.note_date)}</small><p>{note.note}</p></article>)}
            {notes.length === 0 && <div className="children-empty-inline">No learning notes yet.</div>}
          </div>
        </div>
      </div>

      <AssignmentCompletionDialog
        row={completionTarget}
        assignmentTitle={completionTarget ? assignmentById.get(completionTarget.assignment_id)?.title ?? 'Assignment' : ''}
        studentName={childName}
        userId={userId}
        onClose={() => setCompletionTarget(null)}
        onSaved={loadLearning}
      />
    </section>
  )
}
