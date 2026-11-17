/** Transparent, deterministic, staff-reviewed Learning Hub weekly suggestions.
 *  This file never writes records. It intentionally avoids requiring AI services.
 */
export type PlannerSubject = 'reading' | 'writing' | 'grammar' | 'typing' | 'math' | 'general'
export type PlannerDifficulty = 'support' | 'standard' | 'challenge'
export type PlannerAssignment = {
  id: number
  title: string
  subject: PlannerSubject
  assignment_type: string
  grade_levels: string[]
  skill: string | null
  difficulty: PlannerDifficulty
  delivery_format: string
  active: boolean
  activity_config?: { experience?: string } | null
}
export type PlannerHistory = {
  child_id: number
  assignment_id: number
  week_start: string
  status: 'assigned' | 'in_progress' | 'completed' | 'skipped'
  completed_at?: string | null
}
export type PlannerWeeklyAssignment = {
  id: number
  child_id: number
  assignment_id: number
  schedule_id: number | null
  is_optional?: boolean
}
export type PlannerHomework = { child_id: number; id: number }
export type PlannerChild = { id: number; first_name: string; last_name: string | null; is_demo: boolean }
export type PlannerSettings = {
  target: number
  focus: 'balanced' | 'reading' | 'math' | 'typing'
  difficulty: 'any' | PlannerDifficulty
  interactiveOnly: boolean
  grades: Record<number, string>
}
export type PlannerSuggestion = {
  childId: number
  assignmentId: number
  title: string
  subject: PlannerSubject
  reason: string
  difficulty: PlannerDifficulty
}
export type PlannerStudentPlan = {
  child: PlannerChild
  grade: string | null
  existing: number
  suggestions: PlannerSuggestion[]
  message: string | null
}

const interactiveTypes = new Set(['typing', 'quiz', 'reading', 'writing'])
const level = { support: 0, standard: 1, challenge: 2 }
const recentDays = 28

function dateAgeDays(from: string, to: string): number {
  const start = new Date(from + 'T12:00:00Z').getTime()
  const end = new Date(to + 'T12:00:00Z').getTime()
  return Number.isFinite(start) && Number.isFinite(end) ? (end - start) / 86400000 : 10000
}

function countsAsOneAssignment(rows: PlannerWeeklyAssignment[]): number {
  const keys = new Set<string>()
  for (const row of rows) {
    if (row.is_optional) continue
    keys.add(row.schedule_id ? 'schedule-' + row.schedule_id : 'row-' + row.id)
  }
  return keys.size
}

function gradeMatches(assignment: PlannerAssignment, grade: string): boolean {
  return !assignment.grade_levels?.length || assignment.grade_levels.includes(grade)
}

function candidateFor(
  item: PlannerAssignment,
  grade: string,
  settings: PlannerSettings,
  thisWeek: Set<number>,
): boolean {
  if (!item.active || thisWeek.has(item.id)) return false
  if (!gradeMatches(item, grade)) return false
  if (settings.interactiveOnly && !interactiveTypes.has(item.assignment_type)) return false
  // Do not automatically give challenge-level work in the default mix.
  // Staff can explicitly select Challenge when appropriate.
  if (settings.difficulty === 'any' && item.difficulty === 'challenge') return false
  if (settings.difficulty !== 'any' && item.difficulty !== settings.difficulty) return false
  // Never auto-suggest the long multi-station world or an unknown inactive format.
  if (item.activity_config?.experience === 'juanita_quest') return false
  return true
}

export function makeWeeklyPlans(args: {
  children: PlannerChild[]
  registrations: Array<{ child_id: number; grade: string | null }>
  library: PlannerAssignment[]
  history: PlannerHistory[]
  weekly: PlannerWeeklyAssignment[]
  homework: PlannerHomework[]
  weekStart: string
  settings: PlannerSettings
}): PlannerStudentPlan[] {
  const { children, registrations, library, history, weekly, homework, weekStart, settings } = args
  const gradeById = new Map(registrations.map(r => [r.child_id, r.grade?.trim() || null]))
  const historyById = new Map<number, PlannerHistory[]>()
  for (const row of history) {
    historyById.set(row.child_id, [...(historyById.get(row.child_id) ?? []), row])
  }
  const weeklyById = new Map<number, PlannerWeeklyAssignment[]>()
  for (const row of weekly) {
    weeklyById.set(row.child_id, [...(weeklyById.get(row.child_id) ?? []), row])
  }
  const homeworkCountById = new Map<number, number>()
  for (const task of homework) homeworkCountById.set(task.child_id, (homeworkCountById.get(task.child_id) ?? 0) + 1)

  return children.map(child => {
    const grade = settings.grades[child.id] || gradeById.get(child.id) || null
    const thisWeekRows = weeklyById.get(child.id) ?? []
    const existing = countsAsOneAssignment(thisWeekRows) + (homeworkCountById.get(child.id) ?? 0)
    const slots = Math.max(0, Math.min(5, settings.target - existing))
    if (!grade) return { child, grade, existing, suggestions: [], message: 'Choose a learning level to see suggestions.' }
    if (!slots) return { child, grade, existing, suggestions: [], message: 'Weekly workload already meets this target.' }

    const childHistory = historyById.get(child.id) ?? []
    const recent = new Set<number>()
    const ever = new Set<number>()
    const completed = new Set<number>()
    const lastByAssignment = new Map<number, string>()
    const completedSubjects = new Set<string>()
    const completedSkills = new Set<string>()
    const existingSubjects = new Set<PlannerSubject>()
    const thisWeekIds = new Set(thisWeekRows.map(row => row.assignment_id))
    for (const row of thisWeekRows) {
      const item = library.find(x => x.id === row.assignment_id)
      if (item) existingSubjects.add(item.subject)
    }
    for (const row of childHistory) {
      ever.add(row.assignment_id)
      const last = lastByAssignment.get(row.assignment_id)
      if (!last || last < row.week_start) lastByAssignment.set(row.assignment_id, row.week_start)
      if (dateAgeDays(row.week_start, weekStart) < recentDays && dateAgeDays(row.week_start, weekStart) >= 0) recent.add(row.assignment_id)
      if (row.status === 'completed') {
        completed.add(row.assignment_id)
        const item = library.find(x => x.id === row.assignment_id)
        if (item) {
          completedSubjects.add(item.subject)
          if (item.skill?.trim()) completedSkills.add(item.subject + ':' + item.skill.trim().toLowerCase())
        }
      }
    }

    let pool = library.filter(item => candidateFor(item, grade, settings, thisWeekIds))
    // Prefer fresh work to anything assigned in the previous four weeks.
    const fresh = pool.filter(item => !recent.has(item.id))
    if (fresh.length >= slots) pool = fresh
    const suggestions: PlannerSuggestion[] = []
    const chosen = new Set<number>()
    const chosenSubjects = new Set(existingSubjects)

    while (suggestions.length < slots) {
      const ranked = pool.filter(item => !chosen.has(item.id)).map(item => {
        const familiarSkill = Boolean(item.skill?.trim() && completedSkills.has(item.subject + ':' + item.skill.trim().toLowerCase()))
        const brandNew = !ever.has(item.id)
        const gradeSpecific = item.grade_levels.length > 0
        const focusMatches = settings.focus === 'balanced' ? false
          : settings.focus === 'reading' ? ['reading', 'grammar', 'writing'].includes(item.subject)
          : item.subject === settings.focus
        const last = lastByAssignment.get(item.id) ?? ''
        const age = last ? dateAgeDays(last, weekStart) : 365
        const variety = !chosenSubjects.has(item.subject)
        const score = (gradeSpecific ? 10 : 3)
          + (brandNew ? 12 : !completed.has(item.id) ? 6 : 0)
          + (familiarSkill ? 7 : completedSubjects.has(item.subject) ? 3 : 0)
          + (focusMatches ? 9 : 0)
          + (variety ? 9 : 0)
          + (recent.has(item.id) ? -30 : 0)
          + (age >= 56 ? 3 : 0)
          + (item.difficulty === 'standard' && settings.difficulty === 'any' ? 1 : 0)
        const reason = familiarSkill ? 'Builds on a skill they have practiced'
          : brandNew && gradeSpecific ? 'New activity at this learning level'
          : focusMatches ? 'Matches your subject focus'
          : brandNew ? 'Fresh practice, not previously assigned'
          : 'Additional practice after earlier work'
        return { item, score, reason }
      }).sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
      const best = ranked[0]
      if (!best) break
      chosen.add(best.item.id)
      chosenSubjects.add(best.item.subject)
      suggestions.push({
        childId: child.id, assignmentId: best.item.id, title: best.item.title,
        subject: best.item.subject, reason: best.reason, difficulty: best.item.difficulty,
      })
    }
    return {
      child, grade, existing, suggestions,
      message: suggestions.length ? null : 'No suitable unassigned activities at this learning level. Review the Library or choose a different level.',
    }
  })
}
