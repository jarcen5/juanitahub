import type { QuizQuestion } from '@/components/QuizActivityRunner'
import type { WritingConfig } from '@/components/WritingActivityRunner'
import { validateQuestionBank } from '@/lib/learningQuestionVariety'

export type LearningPackAssignment = {
  title: string
  subject: 'math' | 'reading' | 'grammar' | 'writing' | 'general'
  assignment_type: 'quiz' | 'writing'
  skill: string
  grade_levels: string[]
  difficulty: 'support' | 'standard'
  delivery_format: 'digital'
  instructions: string
  estimated_minutes: number
  resource_url: null
  activity_config: (WritingConfig | {
    rotate_questions: true
    questions_per_attempt: number
    questions: QuizQuestion[]
    passing_score: number
    show_explanations: boolean
  })
}

export function question(
  id: string, prompt: string, correct: string,
  distractors: string[], explanation = '', passage = '',
): QuizQuestion {
  const choices = [correct, ...distractors].filter((choice, i, source) =>
    source.findIndex(x => x.trim().toLowerCase() === choice.trim().toLowerCase()) === i
  ).slice(0, 4)
  if (choices.length < 3) throw new Error('Too few distinct choices in ' + id)
  return {
    id, type: passage ? 'reading_comprehension' : 'multiple_choice', prompt,
    choices, correct_answer: correct, explanation, ...(passage ? { passage } : {}),
  }
}

export function numberQuestion(id: string, prompt: string, answer: number, explanation = ''): QuizQuestion {
  const format = (n: number) => String(Math.round(n * 100) / 100)
  const candidates = [
    answer + 1, answer - 1, answer + 2, answer - 2,
    answer + 3, answer - 3, answer + 5, answer / 2,
  ].filter(n => n >= 0 && Number.isFinite(n) && n !== answer)
  const unique = [...new Set(candidates.map(format))].filter(v => v !== format(answer))
  return question(id,prompt,format(answer),unique.slice(0,3),explanation)
}

export function bankQuiz(
  title: string, subject: LearningPackAssignment['subject'],
  grades: string[], skill: string, questions: QuizQuestion[],
  difficulty: LearningPackAssignment['difficulty'] = 'support',
  count = 6,
): LearningPackAssignment {
  const config = { questions, rotate_questions: true as const,
    questions_per_attempt: count, passing_score: 75, show_explanations: true }
  const errors = validateQuestionBank(config)
  if (errors.length) throw new Error(title + ': ' + errors.join('; '))
  return {
    title:'Fresh Practice · ' + title,
    subject, assignment_type:'quiz', skill, grade_levels:grades, difficulty,
    delivery_format:'digital',
    instructions:'Answer ' + count + ' practice questions. A different mix of examples and answer choices appears when you practice again. Use Hear the Question if you need help reading.',
    estimated_minutes: 7, resource_url:null, activity_config:config,
  }
}

export function writingPrompt(
  title: string, grades:string[], skill:string,
  prompt:string, starters:string[], minWords:number, targetWords:number,
  difficulty:LearningPackAssignment['difficulty']='support',
): LearningPackAssignment {
  return {
    title:'Fresh Practice · '+title,subject:'writing',assignment_type:'writing',
    skill,grade_levels:grades,difficulty,delivery_format:'digital',
    instructions:'Read the prompt, plan your ideas, and write a short response. Sentence starters are there if you need them. Ask staff for help before submitting.',
    estimated_minutes:12,resource_url:null,
    activity_config:{
      writing_mode: targetWords > 40 ? 'paragraph' : 'short_response',
      prompt,sentence_starters:starters,min_words:minWords,target_words:targetWords,
      rubric_criteria:['Clear idea','Complete thoughts','Spelling and punctuation'],
    },
  }
}
