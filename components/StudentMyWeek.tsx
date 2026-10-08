'use client'

import { useMemo, type CSSProperties } from 'react'

export type MyWeekItem = {
  rowId: number
  assignmentId: number | null
  kind?: 'assignment' | 'homework'
  homeworkId?: number
  homeworkStatus?: 'assigned' | 'awaiting_review' | 'completed'
  schoolSubject?: string | null
  details?: string | null
  title: string
  subject: 'reading' | 'writing' | 'grammar' | 'typing' | 'math' | 'general'
  assignmentType: 'activity' | 'reading' | 'writing' | 'quiz' | 'typing' | 'worksheet' | 'practice'
  skill: string | null
  status: 'assigned' | 'in_progress' | 'completed' | 'skipped'
  dueDate: string | null
  scheduleId?: number | null
  occurrenceDate?: string | null
  recurringOccurrences?: Array<{
    rowId: number
    date: string
    status: 'assigned' | 'in_progress' | 'completed' | 'skipped'
    score: number | null
    maxScore: number | null
  }>
  recurringTodayRowId?: number | null
  estimatedMinutes: number | null
  score: number | null
  maxScore: number | null
  writingStatus?: 'draft' | 'submitted' | 'reviewed' | null
  readingReviewStatus?: 'not_needed' | 'pending' | 'reviewed' | null
  isJuanitaQuest?: boolean
}

export type StudentGoalView = {
  id: number
  goal_type: 'assignment_completions'|'reading_minutes'|'writing_submissions'|'quiz_consistency'|'typing_accuracy'|'typing_wpm'|'custom'
  title: string
  description: string | null
  start_date: string
  end_date: string
  target_value: number
  target_count: number
  current_value: number
  current_count: number
  reward_points: number
  status: 'active'|'reached'|'approved'|'expired'|'cancelled'
  approved_at?: string | null
}

export type StudentAchievementView = {
  id: number
  achievement_key: string
  title: string
  description: string
  icon: string
  unlocked_at: string
}

type Props = {
  studentName: string
  grade: string | null
  weekLabel: string
  items: MyWeekItem[]
  onLaunch: (item: MyWeekItem) => void
  onHomeworkDone?: (item: MyWeekItem) => void
  onExit: () => void
  exitLabel?: string
  isDemo?: boolean
  goals?: StudentGoalView[]
  achievements?: StudentAchievementView[]
}

const subjectIcons: Record<MyWeekItem['subject'], string> = {
  reading: '📖',
  writing: '✍️',
  grammar: '🔤',
  typing: '⌨️',
  math: '➗',
  general: '🌟',
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

function localDate() {
  const now = new Date()
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
}

function statusFor(item: MyWeekItem) {
  if (item.recurringOccurrences?.length) {
    const done = item.recurringOccurrences.filter((day) => day.status === 'completed' || day.status === 'skipped').length
    if (done === item.recurringOccurrences.length) return { key: 'completed', label: done + '/' + item.recurringOccurrences.length + ' days complete' }
    if (done > 0 || item.recurringOccurrences.some((day) => day.status === 'in_progress')) return { key: 'in_progress', label: done + '/' + item.recurringOccurrences.length + ' days complete' }
    return { key: 'assigned', label: 'Daily practice' }
  }
  if (item.kind === 'homework') {
    if (item.homeworkStatus === 'completed') return { key: 'completed', label: 'Checked by staff' }
    if (item.homeworkStatus === 'awaiting_review') return { key: 'in_progress', label: 'Waiting for staff check' }
    return { key: 'assigned', label: 'School homework' }
  }
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

function goalProgress(goal: StudentGoalView) {
  const repeated = ['quiz_consistency','typing_accuracy','custom'].includes(goal.goal_type)
  const current = repeated ? Number(goal.current_count) : Number(goal.current_value)
  const target = repeated ? Number(goal.target_count) : Number(goal.target_value)
  return Math.max(0, Math.min(100, target ? Math.round(current / target * 100) : 0))
}

function goalProgressLabel(goal: StudentGoalView) {
  if (goal.goal_type === 'reading_minutes') return Math.round(Number(goal.current_value)) + ' / ' + Math.round(Number(goal.target_value)) + ' minutes'
  if (goal.goal_type === 'assignment_completions') return Math.round(Number(goal.current_value)) + ' / ' + Math.round(Number(goal.target_value)) + ' finished'
  if (goal.goal_type === 'writing_submissions') return Math.round(Number(goal.current_value)) + ' / ' + Math.round(Number(goal.target_value)) + ' submitted'
  if (goal.goal_type === 'quiz_consistency') return goal.current_count + ' / ' + goal.target_count + ' quizzes at ' + Number(goal.target_value).toFixed(0) + '%+'
  if (goal.goal_type === 'typing_accuracy') return goal.current_count + ' / ' + goal.target_count + ' activities at ' + Number(goal.target_value).toFixed(0) + '%+'
  if (goal.goal_type === 'typing_wpm') return Number(goal.current_value).toFixed(1) + ' / ' + Number(goal.target_value).toFixed(0) + ' WPM'
  return goal.current_count + ' / ' + goal.target_count + ' check-ins'
}

function isInteractive(item: MyWeekItem) {
  if (item.kind === 'homework') return item.homeworkStatus === 'assigned'
  if (item.recurringOccurrences?.length) {
    const today = item.recurringOccurrences.find((day) => day.date === localDate())
    return Boolean(today && today.status !== 'completed' && today.status !== 'skipped' && ['typing', 'quiz', 'writing', 'reading'].includes(item.assignmentType))
  }
  return ['typing', 'quiz', 'writing', 'reading'].includes(item.assignmentType)
}

function actionLabel(item: MyWeekItem) {
  const status = statusFor(item)
  if (item.recurringOccurrences?.length) {
    const today = item.recurringOccurrences.find((day) => day.date === localDate())
    if (!today) return 'No practice today'
    if (today.status === 'completed' || today.status === 'skipped') return 'Done today ✓'
    if (today.status === 'in_progress') return 'Continue today'
    return 'Start today’s practice'
  }
  if (item.kind === 'homework') {
    if (item.homeworkStatus === 'awaiting_review') return 'Waiting for staff'
    if (item.homeworkStatus === 'completed') return 'Checked ✓'
    return 'I finished my homework'
  }
  if (!isInteractive(item)) return 'Ask staff'
  if (item.isJuanitaQuest) {
    if (status.key === 'completed') return 'Play again'
    return 'Play quest'
  }
  if (item.assignmentType === 'writing' && item.writingStatus === 'draft') return 'Continue writing'
  if (item.assignmentType === 'writing' && (item.writingStatus === 'submitted' || item.writingStatus === 'reviewed')) return 'View writing'
  if (status.key === 'completed') return item.assignmentType === 'writing' ? 'View writing' : 'Practice again'
  if (status.key === 'in_progress') return 'Continue'
  return 'Start'
}

export default function StudentMyWeek({ studentName, grade, weekLabel, items, onLaunch, onHomeworkDone, onExit, exitLabel = 'Back to staff view', isDemo = false, goals = [], achievements = [] }: Props) {
  const displayItems = useMemo(() => {
    const recurringGroups = new Map<number, MyWeekItem[]>()
    const standalone: MyWeekItem[] = []

    for (const item of items) {
      if (item.kind !== 'homework' && item.scheduleId && item.occurrenceDate) {
        recurringGroups.set(item.scheduleId, [...(recurringGroups.get(item.scheduleId) ?? []), item])
      } else {
        standalone.push(item)
      }
    }

    for (const [, group] of recurringGroups) {
      const sorted = [...group].sort((a, b) => String(a.occurrenceDate).localeCompare(String(b.occurrenceDate)))
      const today = sorted.find((item) => item.occurrenceDate === localDate()) ?? null
      const anchor = today ?? sorted[0]
      const done = sorted.filter((item) => item.status === 'completed' || item.status === 'skipped').length
      const aggregateStatus: MyWeekItem['status'] = done === sorted.length
        ? 'completed'
        : done > 0 || sorted.some((item) => item.status === 'in_progress')
          ? 'in_progress'
          : 'assigned'

      standalone.push({
        ...anchor,
        rowId: today?.rowId ?? anchor.rowId,
        dueDate: today?.dueDate ?? null,
        score: today?.score ?? null,
        maxScore: today?.maxScore ?? null,
        status: aggregateStatus,
        recurringTodayRowId: today?.rowId ?? null,
        recurringOccurrences: sorted.map((item) => ({
          rowId: item.rowId,
          date: item.occurrenceDate!,
          status: item.status,
          score: item.score,
          maxScore: item.maxScore,
        })),
      })
    }

    return standalone
  }, [items])

  const completed = displayItems.filter((item) => statusFor(item).key === 'completed' || item.writingStatus === 'submitted' || item.writingStatus === 'reviewed' || item.readingReviewStatus === 'pending' || item.readingReviewStatus === 'reviewed').length
  const inProgress = displayItems.filter((item) => statusFor(item).key === 'in_progress').length
  const todo = Math.max(0, displayItems.length - completed - inProgress)
  const progress = displayItems.length ? Math.round((completed / displayItems.length) * 100) : 0

  const ordered = [...displayItems].sort((a, b) => {
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
            <span>{completed} of {displayItems.length} finished</span>
          </div>
        </section>

        <section className="my-week-stats">
          <article><strong>{todo}</strong><span>To do</span></article>
          <article><strong>{inProgress}</strong><span>In progress</span></article>
          <article><strong>{completed}</strong><span>Finished</span></article>
        </section>

        {(goals.length > 0 || achievements.length > 0) && (
          <section className="my-week-motivation">
            {goals.length > 0 && (
              <div className="my-week-goals">
                <div className="my-week-section-heading"><div><span>🎯</span><strong>Your goals</strong></div><small>Each approved goal is worth +1 bonus point.</small></div>
                <div className="my-week-goal-grid">
                  {goals.filter((goal) => ['active','reached','approved'].includes(goal.status)).slice(0,4).map((goal) => {
                    const progress = goalProgress(goal)
                    return (
                      <article className={'my-week-goal ' + goal.status} key={goal.id}>
                        <div className="my-week-goal-top">
                          <strong>{goal.title}</strong>
                          <em>{goal.status === 'approved' ? '⭐ +1 earned' : goal.status === 'reached' ? '🎉 Reached!' : '+1 point'}</em>
                        </div>
                        <p>{goal.description || 'Keep working toward this goal.'}</p>
                        <div className="my-week-goal-progress"><span><i style={{ width: progress + '%' }} /></span><strong>{goalProgressLabel(goal)}</strong></div>
                        <small>{goal.status === 'reached' ? 'A staff member will confirm your bonus point.' : goal.status === 'approved' ? 'Your bonus point has been added!' : 'Keep going — you’re making progress.'}</small>
                      </article>
                    )
                  })}
                </div>
              </div>
            )}

            {achievements.length > 0 && (
              <div className="my-week-achievements">
                <div className="my-week-section-heading"><div><span>🏅</span><strong>Achievements</strong></div><small>Milestones you’ve unlocked.</small></div>
                <div className="my-week-achievement-row">
                  {achievements.slice(0,6).map((achievement) => <article key={achievement.id}><span>{achievement.icon}</span><strong>{achievement.title}</strong><small>{achievement.description}</small></article>)}
                </div>
              </div>
            )}
          </section>
        )}

        {displayItems.length === 0 ? (
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
              const interactive = isInteractive(item) && (item.kind !== 'homework' || Boolean(onHomeworkDone))
              const isHomework = item.kind === 'homework'
              return (
                <article className={'my-week-card ' + displayStatus.key + (item.isJuanitaQuest ? ' quest-assignment' : '') + (isHomework ? ' homework-assignment' : '')} key={(item.kind ?? 'assignment') + '-' + item.rowId}>
                  <div className="my-week-card-icon">{isHomework ? '🏫' : item.isJuanitaQuest ? '🗺️' : subjectIcons[item.subject]}</div>
                  <div className="my-week-card-copy">
                    <div className="my-week-card-eyebrow">
                      <span>{isHomework ? '🏫 School Homework' : item.isJuanitaQuest ? '🎮 Juanita Quest' : (typeLabels[item.assignmentType] ?? 'Learning activity')}</span>
                      <em className={'my-week-status ' + displayStatus.key}>{displayStatus.label}</em>
                    </div>
                    <h2>{item.title}</h2>
                    <p>{isHomework ? (item.details || 'Complete your school homework, then tell Juanita Hub when you are finished.') : (item.skill || 'Learning practice')}</p>
                    {item.recurringOccurrences?.length ? (
                      <div className="my-week-recurring-days" aria-label="Daily practice progress">
                        {item.recurringOccurrences.map((day) => {
                          const dayDate = new Date(day.date + 'T12:00:00')
                          const isToday = day.date === localDate()
                          const state = day.status === 'completed' || day.status === 'skipped' ? 'done' : day.status === 'in_progress' ? 'active' : isToday ? 'today' : 'pending'
                          return <span className={state} key={day.rowId}><b>{dayDate.toLocaleDateString(undefined, { weekday: 'short' })}</b><em>{state === 'done' ? '✓' : isToday ? '•' : ''}</em></span>
                        })}
                      </div>
                    ) : null}
                    <div className="my-week-card-meta">
                      {isHomework && item.schoolSubject && <span>📚 {item.schoolSubject}</span>}
                      {!item.recurringOccurrences?.length && due && <span>📅 Due {due}</span>}
                      {item.recurringOccurrences?.length && <span>🔁 Daily practice • one check-in per scheduled day</span>}
                      {item.estimatedMinutes != null && <span>⏱ About {item.estimatedMinutes} min</span>}
                      {item.score != null && item.maxScore != null && <span>✓ {item.score}/{item.maxScore}</span>}
                    </div>
                  </div>
                  <button className={interactive ? 'primary' : 'ghost'} type="button" disabled={!interactive} onClick={() => {
                    if (!interactive) return
                    if (isHomework) onHomeworkDone?.(item)
                    else onLaunch(item)
                  }}>{actionLabel(item)}</button>
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
