'use client'

import type { CSSProperties } from 'react'

export type MyWeekItem = {
  rowId: number
  assignmentId: number
  title: string
  subject: 'reading' | 'writing' | 'grammar' | 'typing' | 'math' | 'general'
  assignmentType: 'activity' | 'reading' | 'writing' | 'quiz' | 'typing' | 'worksheet' | 'practice'
  skill: string | null
  status: 'assigned' | 'in_progress' | 'completed' | 'skipped'
  dueDate: string | null
  estimatedMinutes: number | null
  score: number | null
  maxScore: number | null
  writingStatus?: 'draft' | 'submitted' | 'reviewed' | null
  readingReviewStatus?: 'not_needed' | 'pending' | 'reviewed' | null
}

type Props = {
  studentName: string
  grade: string | null
  weekLabel: string
  items: MyWeekItem[]
  onLaunch: (item: MyWeekItem) => void
  onExit: () => void
  exitLabel?: string
  isDemo?: boolean
}

const subjectIcons: Record<MyWeekItem['subject'], string> = {
  reading: '📖',
  writing: '✍️',
  grammar: '🔤',
  typing: '⌨️',
  math: '➗',
  general: '📘',
}

const typeLabels: Partial<Record<MyWeekItem['assignmentType'], string>> = {
  typing: 'Typing Lab',
  quiz: 'Quiz Lab',
  writing: 'Writing Lab',
  reading: 'Reading Lab',
  worksheet: 'Worksheet',
  practice: 'Practice',
  activity: 'Activity',
}

function statusFor(item: MyWeekItem) {
  if (item.status === 'skipped') return { key: 'completed', label: 'Skipped' }
  if (item.assignmentType === 'writing' && item.writingStatus === 'submitted') return { key: 'completed', label: 'Submitted' }
  if (item.assignmentType === 'writing' && item.writingStatus === 'reviewed') return { key: 'completed', label: 'Reviewed' }
  if (item.assignmentType === 'reading' && item.readingReviewStatus === 'pending') return { key: 'completed', label: 'Submitted' }
  if (item.assignmentType === 'reading' && item.readingReviewStatus === 'reviewed') return { key: 'completed', label: 'Reviewed' }
  if (item.status === 'completed') return { key: 'completed', label: 'Completed' }
  if (item.status === 'in_progress') return { key: 'in_progress', label: 'In progress' }
  return { key: 'assigned', label: 'To do' }
}

function formatDue(value: string | null) {
  if (!value) return null
  return new Date(value + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function isInteractive(item: MyWeekItem) {
  return ['typing', 'quiz', 'writing', 'reading'].includes(item.assignmentType)
}

function actionLabel(item: MyWeekItem) {
  const status = statusFor(item)
  if (!isInteractive(item)) return 'Ask staff'
  if (item.assignmentType === 'writing' && item.writingStatus === 'draft') return 'Continue writing'
  if (item.assignmentType === 'writing' && (item.writingStatus === 'submitted' || item.writingStatus === 'reviewed')) return 'View writing'
  if (status.key === 'completed') return item.assignmentType === 'writing' ? 'View writing' : 'Practice again'
  if (status.key === 'in_progress') return 'Continue'
  return 'Start'
}

export default function StudentMyWeek({ studentName, grade, weekLabel, items, onLaunch, onExit, exitLabel = 'Back to staff view', isDemo = false }: Props) {
  const completed = items.filter((item) => ['completed', 'skipped'].includes(item.status) || item.writingStatus === 'submitted' || item.writingStatus === 'reviewed' || item.readingReviewStatus === 'pending' || item.readingReviewStatus === 'reviewed').length
  const inProgress = items.filter((item) => statusFor(item).key === 'in_progress').length
  const todo = Math.max(0, items.length - completed - inProgress)
  const progress = items.length ? Math.round((completed / items.length) * 100) : 0

  const ordered = [...items].sort((a, b) => {
    const order = { in_progress: 0, assigned: 1, completed: 2 } as const
    const aKey = statusFor(a).key as keyof typeof order
    const bKey = statusFor(b).key as keyof typeof order
    if (order[aKey] !== order[bKey]) return order[aKey] - order[bKey]
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
    if (a.dueDate) return -1
    if (b.dueDate) return 1
    return a.title.localeCompare(b.title)
  })

  return (
    <div className="my-week-backdrop">
      <main className="my-week-shell">
        <header className="my-week-topbar">
          <div className="my-week-brand">
            <span>Juanita Hub</span>
            <strong>My Week</strong>
          </div>
          <button className="ghost" type="button" onClick={onExit}>{exitLabel}</button>
        </header>

        <section className="my-week-hero">
          <div>
            <span className="learning-kicker">{weekLabel}{isDemo ? ' • DEMO/TEST STUDENT' : ''}</span>
            <h1>Hi, {studentName.split(' ')[0]}! 👋</h1>
            <p>{grade ? 'Grade ' + grade + ' • ' : ''}Here’s what you’re working on this week.</p>
          </div>
          <div className="my-week-progress-card">
            <div className="my-week-progress-ring" style={{ '--my-week-progress': progress + '%' } as CSSProperties}><strong>{progress}%</strong></div>
            <span>{completed} of {items.length} finished</span>
          </div>
        </section>

        <section className="my-week-stats">
          <article><strong>{todo}</strong><span>To do</span></article>
          <article><strong>{inProgress}</strong><span>In progress</span></article>
          <article><strong>{completed}</strong><span>Finished</span></article>
        </section>

        {items.length === 0 ? (
          <section className="my-week-empty">
            <span>🌟</span>
            <h2>Nothing assigned yet!</h2>
            <p>There isn’t any learning work on your list for this week.</p>
          </section>
        ) : (
          <section className="my-week-list">
            {ordered.map((item) => {
              const displayStatus = statusFor(item)
              const due = formatDue(item.dueDate)
              const interactive = isInteractive(item)
              return (
                <article className={'my-week-card ' + displayStatus.key} key={item.rowId}>
                  <div className="my-week-card-icon">{subjectIcons[item.subject]}</div>
                  <div className="my-week-card-copy">
                    <div className="my-week-card-eyebrow">
                      <span>{typeLabels[item.assignmentType] ?? 'Learning activity'}</span>
                      <em className={'my-week-status ' + displayStatus.key}>{displayStatus.label}</em>
                    </div>
                    <h2>{item.title}</h2>
                    <p>{item.skill || 'Learning practice'}</p>
                    <div className="my-week-card-meta">
                      {due && <span>📅 Due {due}</span>}
                      {item.estimatedMinutes != null && <span>⏱ About {item.estimatedMinutes} min</span>}
                      {item.score != null && item.maxScore != null && <span>✓ {item.score}/{item.maxScore}</span>}
                    </div>
                  </div>
                  <button className={interactive ? 'primary' : 'ghost'} type="button" disabled={!interactive} onClick={() => interactive && onLaunch(item)}>{actionLabel(item)}</button>
                </article>
              )
            })}
          </section>
        )}

        <footer className="my-week-footer">
          <span>Need help? Ask a staff member anytime.</span>
          <button className="ghost" type="button" onClick={onExit}>{exitLabel}</button>
        </footer>
      </main>
    </div>
  )
}
