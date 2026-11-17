import { foundationalPack } from '@/lib/learningExpansionFoundation'
import { upperGradePack, writingExpansionPack } from '@/lib/learningExpansionUpper'
import type { LearningPackAssignment } from '@/lib/learningContentHelpers'
import { validateQuestionBank } from '@/lib/learningQuestionVariety'

/** New optional teaching materials. Never inserted into Supabase on module import.
 * An authorized administrator must explicitly publish them from Assignment Library.
 * Keep the names stable for the "already installed" check.
 */
export const learningExpansionPack: LearningPackAssignment[] = [
  ...foundationalPack, ...upperGradePack, ...writingExpansionPack,
]

export function auditLearningExpansionPack() {
  const errors: string[] = []
  const names = new Set<string>()
  for (const template of learningExpansionPack) {
    const key = template.title.trim().toLowerCase()
    if (names.has(key)) errors.push('Duplicate assignment title: ' + template.title)
    names.add(key)
    if (!template.grade_levels.length) errors.push('Missing learning level: ' + template.title)
    if (template.assignment_type === 'quiz') {
      const config = template.activity_config
      if (!('questions' in config) || !Array.isArray(config.questions)) {
        errors.push('Quiz is missing its question bank: ' + template.title)
      } else {
        errors.push(...validateQuestionBank(config).map(err => template.title + ' — ' + err))
      }
    }
    if (template.assignment_type === 'writing') {
      const config = template.activity_config
      if (!('prompt' in config) || !config.prompt?.trim()) errors.push('Writing prompt missing: ' + template.title)
    }
  }
  return errors
}

export type LibraryCoverageAssignment = {
  id: number; title: string; active: boolean;
  subject: string; assignment_type: string; delivery_format: string;
  difficulty: string; grade_levels: string[];
  activity_config?: {
    questions?: Array<{ id: string }>;
    rotate_questions?: boolean;
    questions_per_attempt?: number;
    experience?: string;
  } | null;
}
const levels = ['K','1','2','3','4','5','6','7']
const subjects = ['reading','grammar','math','writing','typing']

export function getLearningCoverage(library: LibraryCoverageAssignment[]) {
  const eligible = library.filter(a => a.active
    && ['quiz','reading','writing','typing'].includes(a.assignment_type)
    && ['digital','either'].includes(a.delivery_format)
    && a.activity_config?.experience !== 'juanita_quest'
    && a.activity_config?.experience !== 'juanita_mini_game'
  )
  return levels.map(level => {
    const forLevel = eligible.filter(a => !a.grade_levels.length || a.grade_levels.includes(level))
    const bySubject = subjects.map(subject => ({
      subject, count: forLevel.filter(a => a.subject === subject).length,
    }))
    const foundational = forLevel.filter(a => a.difficulty === 'support').length
    const rotating = forLevel.filter(a => a.assignment_type === 'quiz'
      && a.activity_config?.rotate_questions
      && (a.activity_config?.questions?.length ?? 0) > (a.activity_config?.questions_per_attempt ?? 0)).length
    return { level, count: forLevel.length, foundational, rotating, bySubject,
      low: forLevel.length < 16 || foundational < 5,
    }
  })
}
