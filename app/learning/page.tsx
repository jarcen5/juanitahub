'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import AssignmentCompletionDialog from '@/components/AssignmentCompletionDialog'
import AssignmentPreviewDialog from '@/components/AssignmentPreviewDialog'
import TypingActivityRunner from '@/components/TypingActivityRunner'
import AssignmentTestRunner from '@/components/AssignmentTestRunner'
import QuizActivityRunner, { type QuizConfig, type QuizQuestion, type QuizQuestionType } from '@/components/QuizActivityRunner'
import WritingActivityRunner, { type WritingConfig, type WritingMode } from '@/components/WritingActivityRunner'
import WritingReviewDialog, { type WritingSubmission } from '@/components/WritingReviewDialog'
import ReadingActivityRunner, { type ReadingConfig, type ReadingQuestion, type ReadingQuestionType } from '@/components/ReadingActivityRunner'
import ReadingReviewDialog, { type ReadingAttempt } from '@/components/ReadingReviewDialog'
import StudentMyWeek, { type MyWeekItem } from '@/components/StudentMyWeek'

type Profile = { display_name: string; role: 'staff' | 'admin'; active: boolean }
type Child = { id: number; first_name: string; last_name: string | null; active: boolean; is_demo: boolean }
type Registration = { child_id: number; grade: string | null; school: string | null }
type TypingMode = 'passage' | 'letter_drill' | 'guided_keys' | 'hand_placement'
type TypingConfig = {
  mode?: TypingMode
  passage?: string
  focus_keys?: string[]
  target_keystrokes?: number
  target_wpm?: number
  target_accuracy?: number
}
type ActivityConfig = TypingConfig & WritingConfig & {
  questions?: Array<QuizQuestion | ReadingQuestion>
  passing_score?: number
  show_explanations?: boolean
}
type LearningAssignment = {
  id: number
  title: string
  subject: 'reading' | 'writing' | 'grammar' | 'typing' | 'math' | 'general'
  assignment_type: 'activity' | 'reading' | 'writing' | 'quiz' | 'typing' | 'worksheet' | 'practice'
  skill: string | null
  grade_levels: string[]
  difficulty: 'support' | 'standard' | 'challenge'
  delivery_format: 'digital' | 'printable' | 'either'
  instructions: string | null
  estimated_minutes: number | null
  resource_url: string | null
  active: boolean
  activity_config: ActivityConfig
}
type StudentAssignment = {
  id: number
  child_id: number
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
  child_id: number
  read_on: string
  title: string | null
  minutes: number
  pages: string | null
  note: string | null
  created_at: string
}
type LearningNote = {
  id: number
  child_id: number
  note_date: string
  note: string
  created_at: string
}
type TypingAttempt = {
  id: number
  student_assignment_id: number
  child_id: number
  assignment_id: number
  wpm: number
  accuracy: number
  duration_seconds: number
  correct_characters: number
  typed_characters: number
  activity_mode: TypingMode
  focus_keys: string[]
  mistake_counts: Record<string, number>
  created_at: string
}
type QuizAttempt = {
  id: number
  student_assignment_id: number
  child_id: number
  assignment_id: number
  correct_count: number
  question_count: number
  percent: number
  duration_seconds: number
  created_at: string
}
type LearningTab = 'week' | 'my-week' | 'library' | 'typing' | 'quizzes' | 'writing' | 'reading' | 'notes'
type Subject = LearningAssignment['subject']
type AssignmentType = LearningAssignment['assignment_type']
type Difficulty = LearningAssignment['difficulty']
type DeliveryFormat = LearningAssignment['delivery_format']

const subjectLabels: Record<Subject, string> = {
  reading: 'Reading',
  writing: 'Writing',
  grammar: 'Grammar',
  typing: 'Typing',
  math: 'Math',
  general: 'General',
}
const subjectIcons: Record<Subject, string> = {
  reading: '📖',
  writing: '✍️',
  grammar: '🔤',
  typing: '⌨️',
  math: '➗',
  general: '📘',
}

const typingModeLabels: Record<TypingMode, string> = {
  passage: 'Passage Practice',
  letter_drill: 'Letter Practice',
  guided_keys: 'Guided Keys',
  hand_placement: 'Hand Placement',
}

const typingKeyPresets = [
  { label: 'F & J', value: 'f j' },
  { label: 'Home Row', value: 'a s d f g h j k l ;' },
  { label: 'Left Hand', value: 'q w e r t a s d f g z x c v b' },
  { label: 'Right Hand', value: 'y u i o p h j k l ; n m , . /' },
  { label: 'Top Row', value: 'q w e r t y u i o p' },
  { label: 'Bottom Row', value: 'z x c v b n m , . /' },
]

const quizQuestionTypeLabels: Record<QuizQuestionType, string> = {
  multiple_choice: 'Multiple choice',
  correct_sentence: 'Choose corrected sentence',
  fill_blank: 'Fill in the blank',
  spelling: 'Spelling / vocabulary',
  reading_comprehension: 'Reading comprehension',
}

const readingQuestionTypeLabels: Record<ReadingQuestionType, string> = {
  multiple_choice: 'Multiple choice',
  main_idea: 'Main idea',
  detail: 'Supporting detail',
  vocabulary: 'Vocabulary in context',
  short_answer: 'Short response',
}

function isReadingChoiceType(type: ReadingQuestionType) {
  return type !== 'short_answer'
}

function makeReadingQuestion(type: ReadingQuestionType = 'multiple_choice'): ReadingQuestion {
  return {
    id: 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    type,
    prompt: '',
    choices: isReadingChoiceType(type) ? ['', '', '', ''] : [],
    correct_answer: '',
    explanation: '',
  }
}

function isQuizChoiceType(type: QuizQuestionType) {
  return type === 'multiple_choice' || type === 'correct_sentence' || type === 'reading_comprehension'
}

function makeQuestion(type: QuizQuestionType = 'multiple_choice'): QuizQuestion {
  return {
    id: 'q-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    type,
    prompt: '',
    choices: isQuizChoiceType(type) ? ['', '', '', ''] : [],
    correct_answer: '',
    explanation: '',
    passage: '',
  }
}

type StarterAssignment = Omit<LearningAssignment, 'id' | 'active' | 'activity_config'> & { starter_config?: ActivityConfig }

const starterAssignments: StarterAssignment[] = [
  {
    title: 'Reading Reflection',
    subject: 'reading',
    assignment_type: 'writing',
    skill: 'Comprehension & reflection',
    grade_levels: [],
    difficulty: 'standard',
    delivery_format: 'either',
    instructions: 'Read for 15–20 minutes, then write or discuss the main idea, one important detail, and one question you still have.',
    estimated_minutes: 25,
    resource_url: null,
    starter_config: {
      writing_mode: 'reading_response',
      prompt: 'What was the main idea of what you read? Explain one important detail and one question or thought you still have.',
      sentence_starters: ['The main idea was…', 'One important detail was…', 'This made me wonder…'],
      min_words: 50,
      target_words: 100,
      rubric_criteria: ['Ideas & understanding', 'Supporting details', 'Organization', 'Grammar & conventions'],
    },
  },
  {
    title: 'Community Garden Reading Check',
    subject: 'reading',
    assignment_type: 'reading',
    skill: 'Main idea, details & vocabulary',
    grade_levels: [],
    difficulty: 'standard',
    delivery_format: 'digital',
    instructions: 'Read the passage carefully, then answer each comprehension question.',
    estimated_minutes: 15,
    resource_url: null,
    starter_config: {
      passage: 'Every Saturday morning, neighbors meet at a small community garden beside the library. Some people pull weeds while others water the vegetables and flowers. Children help by labeling plants and collecting ripe tomatoes. The garden gives families fresh food, but it also gives neighbors a place to work together. At the end of the morning, everyone shares what they harvested and decides what needs to be done the following week.',
      passing_score: 80,
      show_explanations: true,
      questions: [
        {
          id: 'garden-main',
          type: 'main_idea',
          prompt: 'What is the main idea of the passage?',
          choices: ['The library is closed on Saturdays.', 'Neighbors work together in a community garden.', 'Tomatoes are the easiest vegetables to grow.', 'Children should do all of the garden work.'],
          correct_answer: 'Neighbors work together in a community garden.',
          explanation: 'The passage focuses on the different ways neighbors cooperate in the garden.',
        },
        {
          id: 'garden-detail',
          type: 'detail',
          prompt: 'Which job do children help with in the passage?',
          choices: ['Painting the library', 'Selling vegetables', 'Labeling plants and collecting tomatoes', 'Building a new garden'],
          correct_answer: 'Labeling plants and collecting tomatoes',
          explanation: 'The passage directly says children label plants and collect ripe tomatoes.',
        },
        {
          id: 'garden-vocab',
          type: 'vocabulary',
          prompt: 'What does harvested most nearly mean in the last sentence?',
          choices: ['Planted', 'Gathered from the garden', 'Thrown away', 'Purchased at a store'],
          correct_answer: 'Gathered from the garden',
          explanation: 'The neighbors share the food they collected from the garden.',
        },
        {
          id: 'garden-response',
          type: 'short_answer',
          prompt: 'How does the garden help the neighborhood in more than one way? Use evidence from the passage.',
          choices: [],
          correct_answer: 'A strong response should explain that the garden provides fresh food and also gives neighbors a place to cooperate or spend time working together.',
          explanation: '',
        },
      ],
    },
  },
  {
    title: 'Edit the Sentence',
    subject: 'grammar',
    assignment_type: 'practice',
    skill: 'Capitalization & punctuation',
    grade_levels: [],
    difficulty: 'standard',
    delivery_format: 'either',
    instructions: 'Correct capitalization, punctuation, spelling, and sentence structure in a short set of sentences.',
    estimated_minutes: 15,
    resource_url: null,
  },
  {
    title: 'Punctuation & Capitalization Check',
    subject: 'grammar',
    assignment_type: 'quiz',
    skill: 'Capitalization & punctuation',
    grade_levels: [],
    difficulty: 'standard',
    delivery_format: 'digital',
    instructions: 'Choose or enter the best answer for each grammar question.',
    estimated_minutes: 10,
    resource_url: null,
    starter_config: {
      passing_score: 80,
      show_explanations: true,
      questions: [
        {
          id: 'punct-1',
          type: 'correct_sentence',
          prompt: 'Which sentence is written correctly?',
          choices: ['my friend Maya lives in Boston.', 'My friend maya lives in Boston.', 'My friend Maya lives in Boston.', 'My friend Maya lives in boston.'],
          correct_answer: 'My friend Maya lives in Boston.',
          explanation: 'Names and the first word of a sentence begin with capital letters.',
        },
        {
          id: 'punct-2',
          type: 'multiple_choice',
          prompt: 'Which punctuation mark belongs at the end of this sentence? Where did you put the book',
          choices: ['.', '?', '!', ','],
          correct_answer: '?',
          explanation: 'A direct question ends with a question mark.',
        },
        {
          id: 'punct-3',
          type: 'fill_blank',
          prompt: 'Type the correctly capitalized word to complete the sentence: We visit our family every ___.',
          correct_answer: 'Sunday',
          explanation: 'Days of the week are proper nouns and begin with capital letters.',
        },
        {
          id: 'punct-4',
          type: 'correct_sentence',
          prompt: 'Which sentence uses commas correctly?',
          choices: ['We bought apples oranges and bananas.', 'We bought apples, oranges, and bananas.', 'We bought, apples oranges, and bananas.', 'We bought apples oranges, and, bananas.'],
          correct_answer: 'We bought apples, oranges, and bananas.',
          explanation: 'Commas separate items in a list.',
        },
        {
          id: 'punct-5',
          type: 'multiple_choice',
          prompt: 'Which word should be capitalized? My aunt lives in california.',
          choices: ['aunt', 'lives', 'california', 'in'],
          correct_answer: 'california',
          explanation: 'California is the name of a state, so it should be capitalized.',
        },
      ],
    },
  },
  {
    title: 'Vocabulary in Context',
    subject: 'grammar',
    assignment_type: 'quiz',
    skill: 'Vocabulary & context clues',
    grade_levels: [],
    difficulty: 'standard',
    delivery_format: 'digital',
    instructions: 'Use the sentence clues to choose the meaning that fits best.',
    estimated_minutes: 10,
    resource_url: null,
    starter_config: {
      passing_score: 80,
      show_explanations: true,
      questions: [
        {
          id: 'vocab-1',
          type: 'multiple_choice',
          prompt: 'In the sentence “Nia was exhausted after running three laps,” what does exhausted mean?',
          choices: ['Very tired', 'Very excited', 'Very hungry', 'Very confused'],
          correct_answer: 'Very tired',
          explanation: 'Running several laps can make someone very tired, which is what exhausted means here.',
        },
        {
          id: 'vocab-2',
          type: 'multiple_choice',
          prompt: 'In the sentence “The tiny puppy could fit inside the basket,” what does tiny mean?',
          choices: ['Very small', 'Very loud', 'Very fast', 'Very old'],
          correct_answer: 'Very small',
          explanation: 'The clue that the puppy fits inside a basket shows that tiny means very small.',
        },
        {
          id: 'vocab-3',
          type: 'spelling',
          prompt: 'Type the word that means “to look at something carefully”: examine',
          correct_answer: 'examine',
          explanation: 'Examine means to inspect or look at something carefully.',
        },
      ],
    },
  },
  {
    title: 'Typing Warm-Up',
    subject: 'typing',
    assignment_type: 'typing',
    skill: 'Accuracy & keyboard fluency',
    grade_levels: [],
    difficulty: 'standard',
    delivery_format: 'digital',
    instructions: 'Complete a short focused typing practice. Prioritize accuracy before speed and record the result when finished.',
    estimated_minutes: 15,
    resource_url: null,
    starter_config: {
      mode: 'passage',
      passage: 'Learning new skills takes practice. Good typists focus on accuracy, keep their hands relaxed, and build speed one word at a time. Small improvements add up when you practice regularly.',
      target_wpm: 15,
      target_accuracy: 90,
    },
  },
  {
    title: 'F & J Guided Keys',
    subject: 'typing',
    assignment_type: 'typing',
    skill: 'Home keys & index fingers',
    grade_levels: [],
    difficulty: 'support',
    delivery_format: 'digital',
    instructions: 'Practice finding F and J with the correct index fingers. Keep both hands resting on the home row between key presses.',
    estimated_minutes: 10,
    resource_url: null,
    starter_config: {
      mode: 'guided_keys',
      focus_keys: ['f', 'j'],
      target_keystrokes: 30,
      target_accuracy: 90,
    },
  },
  {
    title: 'Home Row Hand Placement',
    subject: 'typing',
    assignment_type: 'typing',
    skill: 'Home row hand placement',
    grade_levels: [],
    difficulty: 'support',
    delivery_format: 'digital',
    instructions: 'Practice keeping your fingers on the home row and pressing each highlighted key with the finger shown on screen.',
    estimated_minutes: 10,
    resource_url: null,
    starter_config: {
      mode: 'hand_placement',
      focus_keys: ['a','s','d','f','g','h','j','k','l',';'],
      target_keystrokes: 40,
      target_accuracy: 90,
    },
  },
  {
    title: 'Quick Write Journal',
    subject: 'writing',
    assignment_type: 'writing',
    skill: 'Idea development',
    grade_levels: [],
    difficulty: 'standard',
    delivery_format: 'either',
    instructions: 'Respond to a staff-selected prompt with a complete paragraph or age-appropriate written response.',
    estimated_minutes: 20,
    resource_url: null,
    starter_config: {
      writing_mode: 'journal',
      prompt: 'Write about one thing that stood out to you today. Explain what happened, how you felt or what you thought about it, and why it mattered to you.',
      sentence_starters: ['Today I noticed…', 'One thing that stood out was…', 'I felt… because…'],
      min_words: 50,
      target_words: 100,
      rubric_criteria: ['Ideas', 'Organization', 'Details', 'Grammar & conventions'],
    },
  },
  {
    title: 'Creative Story Starter',
    subject: 'writing',
    assignment_type: 'writing',
    skill: 'Creative writing & story development',
    grade_levels: [],
    difficulty: 'standard',
    delivery_format: 'digital',
    instructions: 'Use the prompt to write a short story with a clear beginning, middle, and ending.',
    estimated_minutes: 25,
    resource_url: null,
    starter_config: {
      writing_mode: 'creative',
      prompt: 'You open a door at the community center that you have never noticed before. What is on the other side, and what happens next?',
      sentence_starters: ['At first, I thought…', 'When the door opened…', 'The strangest thing was…'],
      min_words: 75,
      target_words: 150,
      rubric_criteria: ['Ideas & creativity', 'Beginning, middle & ending', 'Details', 'Grammar & conventions'],
    },
  },
  {
    title: 'Math Skill Practice',
    subject: 'math',
    assignment_type: 'practice',
    skill: 'Targeted math review',
    grade_levels: [],
    difficulty: 'standard',
    delivery_format: 'either',
    instructions: 'Complete a short staff-selected math practice set matched to the student’s current grade or skill need.',
    estimated_minutes: 20,
    resource_url: null,
  },
  {
    title: 'Vocabulary Builder',
    subject: 'reading',
    assignment_type: 'practice',
    skill: 'Vocabulary',
    grade_levels: [],
    difficulty: 'standard',
    delivery_format: 'either',
    instructions: 'Choose five unfamiliar or useful words, define them in your own words, and use each one in a sentence.',
    estimated_minutes: 20,
    resource_url: null,
  },
]

function childName(child: Child) {
  return child.first_name + (child.last_name ? ' ' + child.last_name : '')
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
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function dateLabel(value: string) {
  return new Date(value + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function weekLabel(value: string) {
  return dateLabel(value) + ' – ' + dateLabel(addDays(value, 6))
}

function statusLabel(status: StudentAssignment['status']) {
  if (status === 'in_progress') return 'In progress'
  if (status === 'completed') return 'Completed'
  if (status === 'skipped') return 'Skipped'
  return 'Assigned'
}

function normalizeQuizText(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

export default function LearningPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [children, setChildren] = useState<Child[]>([])
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [library, setLibrary] = useState<LearningAssignment[]>([])
  const [weeklyAssignments, setWeeklyAssignments] = useState<StudentAssignment[]>([])
  const [readingLogs, setReadingLogs] = useState<ReadingLog[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [typingAttempts, setTypingAttempts] = useState<TypingAttempt[]>([])
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([])
  const [writingSubmissions, setWritingSubmissions] = useState<WritingSubmission[]>([])
  const [readingAttempts, setReadingAttempts] = useState<ReadingAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [tab, setTab] = useState<LearningTab>('week')
  const [weekStart, setWeekStart] = useState(mondayFor(localDate()))

  const [librarySearch, setLibrarySearch] = useState('')
  const [subjectFilter, setSubjectFilter] = useState<'all' | Subject>('all')
  const [gradeFilter, setGradeFilter] = useState('all')
  const [skillFilter, setSkillFilter] = useState('all')
  const [difficultyFilter, setDifficultyFilter] = useState<'all' | Difficulty>('all')
  const [formatFilter, setFormatFilter] = useState<'all' | DeliveryFormat>('all')
  const [libraryStatusFilter, setLibraryStatusFilter] = useState<'active' | 'archived' | 'all'>('active')
  const [assignmentUsageRows, setAssignmentUsageRows] = useState<{ assignment_id: number; child_id: number; status: StudentAssignment['status'] }[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingAssignmentId, setEditingAssignmentId] = useState<number | null>(null)
  const [starterAdding, setStarterAdding] = useState(false)
  const [previewAssignment, setPreviewAssignment] = useState<LearningAssignment | null>(null)
  const [testAssignment, setTestAssignment] = useState<LearningAssignment | null>(null)
  const [typingTarget, setTypingTarget] = useState<{ row: StudentAssignment; child: Child; assignment: LearningAssignment } | null>(null)
  const [quizTarget, setQuizTarget] = useState<{ row: StudentAssignment; child: Child; assignment: LearningAssignment } | null>(null)
  const [writingTarget, setWritingTarget] = useState<{ row: StudentAssignment; child: Child; assignment: LearningAssignment } | null>(null)
  const [writingReviewTarget, setWritingReviewTarget] = useState<{ submission: WritingSubmission; child: Child; assignment: LearningAssignment } | null>(null)
  const [readingTarget, setReadingTarget] = useState<{ row: StudentAssignment; child: Child; assignment: LearningAssignment } | null>(null)
  const [readingReviewTarget, setReadingReviewTarget] = useState<{ attempt: ReadingAttempt; child: Child; assignment: LearningAssignment } | null>(null)
  const [myWeekChildId, setMyWeekChildId] = useState<number | null>(null)
  const [myWeekOpen, setMyWeekOpen] = useState(false)

  const [newTitle, setNewTitle] = useState('')
  const [newSubject, setNewSubject] = useState<Subject>('reading')
  const [newType, setNewType] = useState<AssignmentType>('activity')
  const [newSkill, setNewSkill] = useState('')
  const [newGrades, setNewGrades] = useState('')
  const [newDifficulty, setNewDifficulty] = useState<Difficulty>('standard')
  const [newFormat, setNewFormat] = useState<DeliveryFormat>('either')
  const [newMinutes, setNewMinutes] = useState('')
  const [newInstructions, setNewInstructions] = useState('')
  const [newResourceUrl, setNewResourceUrl] = useState('')
  const [typingMode, setTypingMode] = useState<TypingMode>('passage')
  const [typingPassage, setTypingPassage] = useState('')
  const [typingFocusKeys, setTypingFocusKeys] = useState('')
  const [typingTargetKeystrokes, setTypingTargetKeystrokes] = useState('30')
  const [typingTargetWpm, setTypingTargetWpm] = useState('15')
  const [typingTargetAccuracy, setTypingTargetAccuracy] = useState('90')
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([])
  const [quizPassingScore, setQuizPassingScore] = useState('80')
  const [quizShowExplanations, setQuizShowExplanations] = useState(true)
  const [writingMode, setWritingMode] = useState<WritingMode>('journal')
  const [writingPrompt, setWritingPrompt] = useState('')
  const [writingStarters, setWritingStarters] = useState('')
  const [writingMinWords, setWritingMinWords] = useState('')
  const [writingTargetWords, setWritingTargetWords] = useState('')
  const [writingRubric, setWritingRubric] = useState('Ideas\nOrganization\nGrammar & conventions')
  const [readingPassageText, setReadingPassageText] = useState('')
  const [readingQuestions, setReadingQuestions] = useState<ReadingQuestion[]>([])
  const [readingPassingScore, setReadingPassingScore] = useState('80')
  const [readingShowExplanations, setReadingShowExplanations] = useState(true)

  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null)
  const [assignMode, setAssignMode] = useState<'child' | 'grade'>('child')
  const [assignChildId, setAssignChildId] = useState<number | null>(null)
  const [assignGrade, setAssignGrade] = useState('')
  const [assignDueDate, setAssignDueDate] = useState('')

  const [readingChildId, setReadingChildId] = useState<number | null>(null)
  const [readingDate, setReadingDate] = useState(localDate())
  const [readingTitle, setReadingTitle] = useState('')
  const [readingMinutes, setReadingMinutes] = useState('15')
  const [readingPages, setReadingPages] = useState('')
  const [readingNote, setReadingNote] = useState('')

  const [noteChildId, setNoteChildId] = useState<number | null>(null)
  const [noteDate, setNoteDate] = useState(localDate())
  const [noteText, setNoteText] = useState('')
  const [completionTarget, setCompletionTarget] = useState<{ row: StudentAssignment; child: Child; assignment: LearningAssignment } | null>(null)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      if (!data.session) setLoading(false)
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
    function syncTab() {
      const requested = window.location.hash.replace('#', '') as LearningTab
      setTab(['week', 'my-week', 'library', 'typing', 'quizzes', 'writing', 'reading', 'notes'].includes(requested) ? requested : 'week')
    }
    syncTab()
    window.addEventListener('hashchange', syncTab)
    return () => window.removeEventListener('hashchange', syncTab)
  }, [])

  useEffect(() => {
    if (!session) {
      setProfile(null)
      return
    }
    void loadData()
  }, [session, weekStart])

  async function loadData() {
    if (!session) return
    setLoading(true)
    setMessage('')
    const weekEnd = addDays(weekStart, 6)

    const [profileResult, childResult, registrationResult, libraryResult, weeklyResult, readingResult, notesResult, usageResult, typingResult, quizResult, writingResult, readingAttemptResult] = await Promise.all([
      supabase.from('staff_profiles').select('display_name, role, active').eq('user_id', session.user.id).maybeSingle(),
      supabase.from('children').select('id, first_name, last_name, active, is_demo').eq('active', true).order('first_name').order('last_name'),
      supabase.from('child_registrations').select('child_id, grade, school').eq('status', 'active'),
      supabase.from('learning_assignments').select('id, title, subject, assignment_type, skill, grade_levels, difficulty, delivery_format, instructions, estimated_minutes, resource_url, active, activity_config').order('subject').order('title'),
      supabase.from('learning_student_assignments').select('id, child_id, assignment_id, week_start, due_date, status, completed_at, score, max_score, minutes_spent, staff_note').eq('week_start', weekStart).order('child_id').order('id'),
      supabase.from('learning_reading_logs').select('id, child_id, read_on, title, minutes, pages, note, created_at').gte('read_on', weekStart).lte('read_on', weekEnd).order('read_on', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('learning_staff_notes').select('id, child_id, note_date, note, created_at').order('note_date', { ascending: false }).order('created_at', { ascending: false }).limit(120),
      supabase.from('learning_student_assignments').select('assignment_id, child_id, status'),
      supabase.from('learning_typing_attempts').select('id, student_assignment_id, child_id, assignment_id, wpm, accuracy, duration_seconds, correct_characters, typed_characters, activity_mode, focus_keys, mistake_counts, created_at').order('created_at', { ascending: false }).limit(80),
      supabase.from('learning_quiz_attempts').select('id, student_assignment_id, child_id, assignment_id, correct_count, question_count, percent, duration_seconds, created_at').order('created_at', { ascending: false }).limit(80),
      supabase.from('learning_writing_submissions').select('id, student_assignment_id, child_id, assignment_id, content, word_count, status, started_at, submitted_at, last_saved_at, active_seconds, staff_feedback, rubric_scores, reviewed_at, updated_at').order('updated_at', { ascending: false }).limit(120),
      supabase.from('learning_reading_attempts').select('id, student_assignment_id, child_id, assignment_id, answers, objective_correct, objective_count, written_count, review_scores, review_status, staff_feedback, reading_seconds, duration_seconds, submitted_at, reviewed_at, created_at').order('created_at', { ascending: false }).limit(120),
    ])

    const error = profileResult.error
      ?? childResult.error
      ?? registrationResult.error
      ?? libraryResult.error
      ?? weeklyResult.error
      ?? readingResult.error
      ?? notesResult.error
      ?? usageResult.error
      ?? typingResult.error
      ?? quizResult.error
      ?? writingResult.error
      ?? readingAttemptResult.error

    const nextChildren = (childResult.data ?? []) as Child[]
    setProfile(profileResult.data as Profile | null)
    setChildren(nextChildren)
    setRegistrations((registrationResult.data ?? []) as Registration[])
    setLibrary((libraryResult.data ?? []) as LearningAssignment[])
    setWeeklyAssignments((weeklyResult.data ?? []) as StudentAssignment[])
    setReadingLogs((readingResult.data ?? []) as ReadingLog[])
    setNotes((notesResult.data ?? []) as LearningNote[])
    setAssignmentUsageRows((usageResult.data ?? []) as { assignment_id: number; child_id: number; status: StudentAssignment['status'] }[])
    setTypingAttempts((typingResult.data ?? []) as TypingAttempt[])
    setQuizAttempts((quizResult.data ?? []) as QuizAttempt[])
    setWritingSubmissions((writingResult.data ?? []) as WritingSubmission[])
    setReadingAttempts((readingAttemptResult.data ?? []) as ReadingAttempt[])
    setAssignChildId((current) => current && nextChildren.some((child) => child.id === current) ? current : nextChildren[0]?.id ?? null)
    setMyWeekChildId((current) => current && nextChildren.some((child) => child.id === current) ? current : nextChildren[0]?.id ?? null)
    setReadingChildId((current) => current && nextChildren.some((child) => child.id === current) ? current : nextChildren[0]?.id ?? null)
    setNoteChildId((current) => current && nextChildren.some((child) => child.id === current) ? current : nextChildren[0]?.id ?? null)
    if (error) setMessage(error.message)
    setLoading(false)
  }

  const childById = useMemo(() => new Map(children.map((child) => [child.id, child])), [children])
  const reportingChildIds = useMemo(() => new Set(children.filter((child) => !child.is_demo).map((child) => child.id)), [children])
  const registrationByChild = useMemo(() => new Map(registrations.map((registration) => [registration.child_id, registration])), [registrations])
  const assignmentById = useMemo(() => new Map(library.map((assignment) => [assignment.id, assignment])), [library])
  const gradeOptions = useMemo(() => [...new Set(registrations.map((registration) => registration.grade?.trim()).filter((grade): grade is string => Boolean(grade)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [registrations])

  useEffect(() => {
    if (!assignGrade && gradeOptions.length) setAssignGrade(gradeOptions[0])
  }, [gradeOptions, assignGrade])

  const skillOptions = useMemo(() => {
    return [...new Set(library
      .filter((assignment) => {
        if (libraryStatusFilter === 'active' && !assignment.active) return false
        if (libraryStatusFilter === 'archived' && assignment.active) return false
        if (gradeFilter !== 'all' && assignment.grade_levels.length > 0 && !assignment.grade_levels.includes(gradeFilter)) return false
        if (subjectFilter !== 'all' && assignment.subject !== subjectFilter) return false
        return Boolean(assignment.skill?.trim())
      })
      .map((assignment) => assignment.skill!.trim()))]
      .sort((a, b) => a.localeCompare(b))
  }, [library, libraryStatusFilter, gradeFilter, subjectFilter])

  useEffect(() => {
    if (skillFilter !== 'all' && !skillOptions.includes(skillFilter)) setSkillFilter('all')
  }, [skillOptions, skillFilter])

  const filteredLibrary = useMemo(() => {
    const needle = librarySearch.trim().toLowerCase()
    return library.filter((assignment) => {
      if (libraryStatusFilter === 'active' && !assignment.active) return false
      if (libraryStatusFilter === 'archived' && assignment.active) return false
      if (subjectFilter !== 'all' && assignment.subject !== subjectFilter) return false
      if (gradeFilter !== 'all' && assignment.grade_levels.length > 0 && !assignment.grade_levels.includes(gradeFilter)) return false
      if (skillFilter !== 'all' && assignment.skill !== skillFilter) return false
      if (difficultyFilter !== 'all' && assignment.difficulty !== difficultyFilter) return false
      if (formatFilter !== 'all' && assignment.delivery_format !== formatFilter) return false
      if (!needle) return true
      return [assignment.title, assignment.skill ?? '', assignment.instructions ?? '', subjectLabels[assignment.subject]]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [library, librarySearch, subjectFilter, gradeFilter, skillFilter, difficultyFilter, formatFilter, libraryStatusFilter])

  const usageByAssignment = useMemo(() => {
    const map = new Map<number, { assigned: number; completed: number }>()
    for (const row of assignmentUsageRows) {
      if (!reportingChildIds.has(row.child_id)) continue
      const current = map.get(row.assignment_id) ?? { assigned: 0, completed: 0 }
      current.assigned += 1
      if (row.status === 'completed') current.completed += 1
      map.set(row.assignment_id, current)
    }
    return map
  }, [assignmentUsageRows, reportingChildIds])

  const libraryGroups = useMemo(() => {
    const groups: { subject: Subject; skills: { skill: string; assignments: LearningAssignment[] }[] }[] = []
    for (const subject of Object.keys(subjectLabels) as Subject[]) {
      const subjectAssignments = filteredLibrary.filter((assignment) => assignment.subject === subject)
      if (!subjectAssignments.length) continue
      const skillMap = new Map<string, LearningAssignment[]>()
      for (const assignment of subjectAssignments) {
        const key = assignment.skill?.trim() || 'General'
        skillMap.set(key, [...(skillMap.get(key) ?? []), assignment])
      }
      groups.push({
        subject,
        skills: [...skillMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([skill, assignments]) => ({ skill, assignments })),
      })
    }
    return groups
  }, [filteredLibrary])

  const selectedAssignment = useMemo(() => library.find((assignment) => assignment.id === selectedAssignmentId) ?? null, [library, selectedAssignmentId])

  const assignmentPreview = useMemo(() => {
    if (!selectedAssignment) return { total: 0, already: 0, willAssign: 0 }
    const targetIds = assignMode === 'child'
      ? (assignChildId ? [assignChildId] : [])
      : children.filter((child) => registrationByChild.get(child.id)?.grade === assignGrade).map((child) => child.id)
    const assignedIds = new Set(
      weeklyAssignments
        .filter((row) => row.assignment_id === selectedAssignment.id)
        .map((row) => row.child_id),
    )
    const already = targetIds.filter((id) => assignedIds.has(id)).length
    return { total: targetIds.length, already, willAssign: targetIds.length - already }
  }, [selectedAssignment, assignMode, assignChildId, assignGrade, children, registrationByChild, weeklyAssignments])

  const weeklyByChild = useMemo(() => {
    const map = new Map<number, StudentAssignment[]>()
    for (const row of weeklyAssignments) {
      const current = map.get(row.child_id) ?? []
      current.push(row)
      map.set(row.child_id, current)
    }
    return map
  }, [weeklyAssignments])

  const readingByChild = useMemo(() => {
    const map = new Map<number, ReadingLog[]>()
    for (const row of readingLogs) {
      const current = map.get(row.child_id) ?? []
      current.push(row)
      map.set(row.child_id, current)
    }
    return map
  }, [readingLogs])

  const weeklyChildren = useMemo(() => children.filter((child) => (weeklyByChild.get(child.id)?.length ?? 0) > 0 || (readingByChild.get(child.id)?.length ?? 0) > 0), [children, weeklyByChild, readingByChild])

  const reportingWeeklyAssignments = useMemo(() => weeklyAssignments.filter((row) => reportingChildIds.has(row.child_id)), [weeklyAssignments, reportingChildIds])
  const reportingReadingLogs = useMemo(() => readingLogs.filter((row) => reportingChildIds.has(row.child_id)), [readingLogs, reportingChildIds])
  const metrics = useMemo(() => ({
    assigned: reportingWeeklyAssignments.length,
    completed: reportingWeeklyAssignments.filter((row) => row.status === 'completed').length,
    readingMinutes: reportingReadingLogs.reduce((sum, row) => sum + Number(row.minutes), 0),
    children: new Set([...reportingWeeklyAssignments.map((row) => row.child_id), ...reportingReadingLogs.map((row) => row.child_id)]).size,
  }), [reportingWeeklyAssignments, reportingReadingLogs])

  const weeklyTypingAssignments = useMemo(() => reportingWeeklyAssignments.filter((row) => assignmentById.get(row.assignment_id)?.assignment_type === 'typing'), [reportingWeeklyAssignments, assignmentById])
  const weeklyTypingIds = useMemo(() => new Set(weeklyTypingAssignments.map((row) => row.id)), [weeklyTypingAssignments])
  const weeklyTypingAttempts = useMemo(() => typingAttempts.filter((attempt) => weeklyTypingIds.has(attempt.student_assignment_id)), [typingAttempts, weeklyTypingIds])
  const typingSummary = useMemo(() => {
    const attempts = weeklyTypingAttempts.length
    const speedAttempts = weeklyTypingAttempts.filter((attempt) => attempt.activity_mode === 'passage' || attempt.activity_mode === 'letter_drill')
    const averageWpm = speedAttempts.length ? speedAttempts.reduce((sum, attempt) => sum + Number(attempt.wpm), 0) / speedAttempts.length : 0
    const averageAccuracy = attempts ? weeklyTypingAttempts.reduce((sum, attempt) => sum + Number(attempt.accuracy), 0) / attempts : 0
    return {
      assigned: weeklyTypingAssignments.length,
      completed: weeklyTypingAssignments.filter((row) => row.status === 'completed').length,
      attempts,
      speedAttempts: speedAttempts.length,
      averageWpm,
      averageAccuracy,
    }
  }, [weeklyTypingAssignments, weeklyTypingAttempts])

  const weeklyQuizAssignments = useMemo(() => reportingWeeklyAssignments.filter((row) => assignmentById.get(row.assignment_id)?.assignment_type === 'quiz'), [reportingWeeklyAssignments, assignmentById])
  const weeklyQuizIds = useMemo(() => new Set(weeklyQuizAssignments.map((row) => row.id)), [weeklyQuizAssignments])
  const weeklyQuizAttempts = useMemo(() => quizAttempts.filter((attempt) => weeklyQuizIds.has(attempt.student_assignment_id)), [quizAttempts, weeklyQuizIds])
  const quizSummary = useMemo(() => {
    const attempts = weeklyQuizAttempts.length
    const averagePercent = attempts ? weeklyQuizAttempts.reduce((sum, attempt) => sum + Number(attempt.percent), 0) / attempts : 0
    return {
      assigned: weeklyQuizAssignments.length,
      completed: weeklyQuizAssignments.filter((row) => row.status === 'completed').length,
      attempts,
      averagePercent,
    }
  }, [weeklyQuizAssignments, weeklyQuizAttempts])

  const weeklyWritingAssignments = useMemo(() => reportingWeeklyAssignments.filter((row) => assignmentById.get(row.assignment_id)?.assignment_type === 'writing'), [reportingWeeklyAssignments, assignmentById])
  const weeklyWritingIds = useMemo(() => new Set(weeklyWritingAssignments.map((row) => row.id)), [weeklyWritingAssignments])
  const weeklyWritingSubmissions = useMemo(() => writingSubmissions.filter((submission) => weeklyWritingIds.has(submission.student_assignment_id)), [writingSubmissions, weeklyWritingIds])
  const writingSummary = useMemo(() => ({
    assigned: weeklyWritingAssignments.length,
    submitted: weeklyWritingSubmissions.filter((submission) => submission.status === 'submitted').length,
    reviewed: weeklyWritingSubmissions.filter((submission) => submission.status === 'reviewed').length,
    drafts: weeklyWritingSubmissions.filter((submission) => submission.status === 'draft').length,
    words: weeklyWritingSubmissions.reduce((sum, submission) => sum + Number(submission.word_count), 0),
  }), [weeklyWritingAssignments, weeklyWritingSubmissions])

  const weeklyReadingAssignments = useMemo(() => reportingWeeklyAssignments.filter((row) => assignmentById.get(row.assignment_id)?.assignment_type === 'reading'), [reportingWeeklyAssignments, assignmentById])
  const weeklyReadingIds = useMemo(() => new Set(weeklyReadingAssignments.map((row) => row.id)), [weeklyReadingAssignments])
  const weeklyReadingAttempts = useMemo(() => readingAttempts.filter((attempt) => weeklyReadingIds.has(attempt.student_assignment_id)), [readingAttempts, weeklyReadingIds])
  const readingLabSummary = useMemo(() => {
    const pending = weeklyReadingAttempts.filter((attempt) => attempt.review_status === 'pending').length
    const reviewed = weeklyReadingAttempts.filter((attempt) => attempt.review_status === 'reviewed').length
    const autoAttempts = weeklyReadingAttempts.filter((attempt) => attempt.written_count === 0 && attempt.objective_count > 0)
    const autoAverage = autoAttempts.length
      ? autoAttempts.reduce((sum, attempt) => sum + (Number(attempt.objective_correct) / Number(attempt.objective_count)) * 100, 0) / autoAttempts.length
      : 0
    return {
      assigned: weeklyReadingAssignments.length,
      attempts: weeklyReadingAttempts.length,
      pending,
      reviewed,
      autoAttempts: autoAttempts.length,
      autoAverage,
    }
  }, [weeklyReadingAssignments, weeklyReadingAttempts])

  const myWeekChild = useMemo(() => myWeekChildId ? childById.get(myWeekChildId) ?? null : null, [myWeekChildId, childById])
  const myWeekItems = useMemo<MyWeekItem[]>(() => {
    if (!myWeekChildId) return []
    return (weeklyByChild.get(myWeekChildId) ?? []).flatMap((row) => {
      const assignment = assignmentById.get(row.assignment_id)
      if (!assignment) return []
      const writingSubmission = assignment.assignment_type === 'writing'
        ? writingSubmissions.find((submission) => submission.student_assignment_id === row.id) ?? null
        : null
      const readingAttempt = assignment.assignment_type === 'reading'
        ? readingAttempts.find((attempt) => attempt.student_assignment_id === row.id) ?? null
        : null
      return [{
        rowId: row.id,
        assignmentId: assignment.id,
        title: assignment.title,
        subject: assignment.subject,
        assignmentType: assignment.assignment_type,
        skill: assignment.skill,
        status: row.status,
        dueDate: row.due_date,
        estimatedMinutes: assignment.estimated_minutes,
        score: row.score,
        maxScore: row.max_score,
        writingStatus: writingSubmission?.status ?? null,
        readingReviewStatus: readingAttempt?.review_status ?? null,
      }]
    })
  }, [myWeekChildId, weeklyByChild, assignmentById, writingSubmissions, readingAttempts])

  function launchMyWeekItem(item: MyWeekItem) {
    if (!myWeekChildId) return
    const child = childById.get(myWeekChildId)
    const row = weeklyAssignments.find((assignment) => assignment.id === item.rowId)
    const assignment = assignmentById.get(item.assignmentId)
    if (!child || !row || !assignment) return
    if (assignment.assignment_type === 'typing') setTypingTarget({ row, child, assignment })
    else if (assignment.assignment_type === 'quiz') setQuizTarget({ row, child, assignment })
    else if (assignment.assignment_type === 'writing') setWritingTarget({ row, child, assignment })
    else if (assignment.assignment_type === 'reading') setReadingTarget({ row, child, assignment })
  }

  function showMessage(text: string) {
    setMessage(text)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resetAssignmentEditor() {
    setEditingAssignmentId(null)
    setNewTitle('')
    setNewSubject('reading')
    setNewType('activity')
    setNewSkill('')
    setNewGrades('')
    setNewDifficulty('standard')
    setNewFormat('either')
    setNewMinutes('')
    setNewInstructions('')
    setNewResourceUrl('')
    setTypingMode('passage')
    setTypingPassage('')
    setTypingFocusKeys('')
    setTypingTargetKeystrokes('30')
    setTypingTargetWpm('15')
    setTypingTargetAccuracy('90')
    setQuizQuestions([])
    setQuizPassingScore('80')
    setQuizShowExplanations(true)
    setWritingMode('journal')
    setWritingPrompt('')
    setWritingStarters('')
    setWritingMinWords('')
    setWritingTargetWords('')
    setWritingRubric('Ideas\nOrganization\nGrammar & conventions')
    setReadingPassageText('')
    setReadingQuestions([])
    setReadingPassingScore('80')
    setReadingShowExplanations(true)
  }

  function beginAddAssignment() {
    resetAssignmentEditor()
    setEditorOpen(true)
  }

  function updateQuizQuestion(id: string, patch: Partial<QuizQuestion>) {
    setQuizQuestions((questions) => questions.map((question) => question.id === id ? { ...question, ...patch } : question))
  }

  function changeQuizQuestionType(id: string, type: QuizQuestionType) {
    setQuizQuestions((questions) => questions.map((question) => {
      if (question.id !== id) return question
      return {
        ...question,
        type,
        choices: isQuizChoiceType(type) ? (question.choices?.length ? question.choices : ['', '', '', '']) : [],
        passage: type === 'reading_comprehension' ? (question.passage ?? '') : '',
        correct_answer: '',
      }
    }))
  }

  function updateQuizChoice(questionId: string, index: number, value: string) {
    setQuizQuestions((questions) => questions.map((question) => {
      if (question.id !== questionId) return question
      const choices = [...(question.choices ?? ['', '', '', ''])]
      const oldValue = choices[index] ?? ''
      choices[index] = value
      return {
        ...question,
        choices,
        correct_answer: normalizeQuizText(question.correct_answer) === normalizeQuizText(oldValue) ? value : question.correct_answer,
      }
    }))
  }

  function moveQuizQuestion(index: number, direction: -1 | 1) {
    setQuizQuestions((questions) => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= questions.length) return questions
      const next = [...questions]
      const [item] = next.splice(index, 1)
      next.splice(nextIndex, 0, item)
      return next
    })
  }

  function updateReadingQuestion(id: string, patch: Partial<ReadingQuestion>) {
    setReadingQuestions((questions) => questions.map((question) => question.id === id ? { ...question, ...patch } : question))
  }

  function changeReadingQuestionType(id: string, type: ReadingQuestionType) {
    setReadingQuestions((questions) => questions.map((question) => {
      if (question.id !== id) return question
      return {
        ...question,
        type,
        choices: isReadingChoiceType(type) ? (question.choices?.length ? question.choices : ['', '', '', '']) : [],
        correct_answer: '',
      }
    }))
  }

  function updateReadingChoice(questionId: string, index: number, value: string) {
    setReadingQuestions((questions) => questions.map((question) => {
      if (question.id !== questionId) return question
      const choices = [...(question.choices ?? ['', '', '', ''])]
      const oldValue = choices[index] ?? ''
      choices[index] = value
      return {
        ...question,
        choices,
        correct_answer: normalizeQuizText(question.correct_answer ?? '') === normalizeQuizText(oldValue) ? value : question.correct_answer,
      }
    }))
  }

  function moveReadingQuestion(index: number, direction: -1 | 1) {
    setReadingQuestions((questions) => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= questions.length) return questions
      const next = [...questions]
      const [item] = next.splice(index, 1)
      next.splice(nextIndex, 0, item)
      return next
    })
  }

  function beginEditAssignment(assignment: LearningAssignment) {
    setEditingAssignmentId(assignment.id)
    setNewTitle(assignment.title)
    setNewSubject(assignment.subject)
    setNewType(assignment.assignment_type)
    setNewSkill(assignment.skill ?? '')
    setNewGrades(assignment.grade_levels.join(', '))
    setNewDifficulty(assignment.difficulty)
    setNewFormat(assignment.delivery_format)
    setNewMinutes(assignment.estimated_minutes == null ? '' : String(assignment.estimated_minutes))
    setNewInstructions(assignment.instructions ?? '')
    setNewResourceUrl(assignment.resource_url ?? '')
    setTypingMode(assignment.activity_config?.mode ?? 'passage')
    setTypingPassage(typeof assignment.activity_config?.passage === 'string' ? assignment.activity_config.passage : '')
    setTypingFocusKeys(Array.isArray(assignment.activity_config?.focus_keys) ? assignment.activity_config.focus_keys.map((key) => key === ' ' ? 'space' : key).join(' ') : '')
    setTypingTargetKeystrokes(typeof assignment.activity_config?.target_keystrokes === 'number' ? String(assignment.activity_config.target_keystrokes) : '30')
    setTypingTargetWpm(typeof assignment.activity_config?.target_wpm === 'number' ? String(assignment.activity_config.target_wpm) : '15')
    setTypingTargetAccuracy(typeof assignment.activity_config?.target_accuracy === 'number' ? String(assignment.activity_config.target_accuracy) : '90')
    setQuizQuestions(assignment.assignment_type === 'quiz' && Array.isArray(assignment.activity_config?.questions) ? assignment.activity_config.questions as QuizQuestion[] : [])
    setQuizPassingScore(typeof assignment.activity_config?.passing_score === 'number' ? String(assignment.activity_config.passing_score) : '80')
    setQuizShowExplanations(assignment.activity_config?.show_explanations !== false)
    setWritingMode(assignment.activity_config?.writing_mode ?? 'journal')
    setWritingPrompt(typeof assignment.activity_config?.prompt === 'string' ? assignment.activity_config.prompt : '')
    setWritingStarters(Array.isArray(assignment.activity_config?.sentence_starters) ? assignment.activity_config.sentence_starters.join('\n') : '')
    setWritingMinWords(typeof assignment.activity_config?.min_words === 'number' ? String(assignment.activity_config.min_words) : '')
    setWritingTargetWords(typeof assignment.activity_config?.target_words === 'number' ? String(assignment.activity_config.target_words) : '')
    setWritingRubric(Array.isArray(assignment.activity_config?.rubric_criteria) ? assignment.activity_config.rubric_criteria.join('\n') : 'Ideas\nOrganization\nGrammar & conventions')
    setReadingPassageText(typeof assignment.activity_config?.passage === 'string' && assignment.assignment_type === 'reading' ? assignment.activity_config.passage : '')
    setReadingQuestions(assignment.assignment_type === 'reading' && Array.isArray(assignment.activity_config?.questions) ? assignment.activity_config.questions as ReadingQuestion[] : [])
    setReadingPassingScore(assignment.assignment_type === 'reading' && typeof assignment.activity_config?.passing_score === 'number' ? String(assignment.activity_config.passing_score) : '80')
    setReadingShowExplanations(assignment.assignment_type === 'reading' ? assignment.activity_config?.show_explanations !== false : true)
    setEditorOpen(true)
  }

  async function saveAssignment() {
    if (!session || profile?.role !== 'admin' || saving || !newTitle.trim()) return
    const focusKeys = [...new Set(typingFocusKeys
      .split(/[\s,]+/)
      .map((key) => key.trim().toLowerCase())
      .filter(Boolean)
      .map((key) => key === 'space' ? ' ' : key)
      .filter((key) => key.length === 1))]
    const parsedTargetKeystrokes = typingTargetKeystrokes.trim() ? Number(typingTargetKeystrokes) : 30
    const parsedTargetWpm = typingTargetWpm.trim() ? Number(typingTargetWpm) : null
    const parsedTargetAccuracy = typingTargetAccuracy.trim() ? Number(typingTargetAccuracy) : null
    const speedMode = typingMode === 'passage' || typingMode === 'letter_drill'

    if (newType === 'typing' && typingMode === 'passage' && !typingPassage.trim()) return showMessage('Add a typing passage before saving Passage Practice.')
    if (newType === 'typing' && typingMode !== 'passage' && !focusKeys.length) return showMessage('Choose at least one practice key for this typing mode.')
    if (newType === 'typing' && typingMode !== 'passage' && (!Number.isFinite(parsedTargetKeystrokes) || parsedTargetKeystrokes < 5 || parsedTargetKeystrokes > 500)) return showMessage('Correct-key goal must be between 5 and 500.')
    if (newType === 'typing' && speedMode && parsedTargetWpm != null && (!Number.isFinite(parsedTargetWpm) || parsedTargetWpm <= 0)) return showMessage('Typing WPM goal must be greater than 0.')
    if (newType === 'typing' && parsedTargetAccuracy != null && (!Number.isFinite(parsedTargetAccuracy) || parsedTargetAccuracy < 0 || parsedTargetAccuracy > 100)) return showMessage('Typing accuracy goal must be between 0 and 100.')

    const parsedPassingScore = quizPassingScore.trim() ? Number(quizPassingScore) : 80
    if (newType === 'quiz') {
      if (!quizQuestions.length) return showMessage('Add at least one quiz question before saving.')
      if (!Number.isFinite(parsedPassingScore) || parsedPassingScore < 0 || parsedPassingScore > 100) return showMessage('Quiz goal must be between 0 and 100%.')
      for (let index = 0; index < quizQuestions.length; index += 1) {
        const question = quizQuestions[index]
        if (!question.prompt.trim()) return showMessage('Question ' + (index + 1) + ' needs a prompt.')
        if (!question.correct_answer.trim()) return showMessage('Question ' + (index + 1) + ' needs a correct answer.')
        if (isQuizChoiceType(question.type) && (question.choices ?? []).filter((choice) => choice.trim()).length < 2) return showMessage('Question ' + (index + 1) + ' needs at least two answer choices.')
        if (isQuizChoiceType(question.type) && !(question.choices ?? []).some((choice) => normalizeQuizText(choice) === normalizeQuizText(question.correct_answer))) return showMessage('Question ' + (index + 1) + ' correct answer must match one of its choices.')
      }
    }

    const grades = [...new Set(newGrades.split(',').map((grade) => grade.trim()).filter(Boolean))]
    let activityConfig: ActivityConfig = {}
    if (newType === 'typing') {
      activityConfig = {
        mode: typingMode,
        ...(typingMode === 'passage' ? { passage: typingPassage.trim() } : { focus_keys: focusKeys, target_keystrokes: Math.round(parsedTargetKeystrokes) }),
        ...(speedMode && parsedTargetWpm != null ? { target_wpm: parsedTargetWpm } : {}),
        ...(parsedTargetAccuracy == null ? {} : { target_accuracy: parsedTargetAccuracy }),
      }
    } else if (newType === 'quiz') {
      activityConfig = {
        questions: quizQuestions.map((question) => ({
          ...question,
          prompt: question.prompt.trim(),
          correct_answer: question.correct_answer.trim(),
          choices: (question.choices ?? []).map((choice) => choice.trim()).filter(Boolean),
          explanation: question.explanation?.trim() || '',
          passage: question.passage?.trim() || '',
        })),
        passing_score: parsedPassingScore,
        show_explanations: quizShowExplanations,
      }
    } else if (newType === 'writing') {
      const parsedMinWords = writingMinWords.trim() ? Number(writingMinWords) : null
      const parsedTargetWords = writingTargetWords.trim() ? Number(writingTargetWords) : null
      if (!writingPrompt.trim()) return showMessage('Add a writing prompt before saving a Writing Lab activity.')
      if (parsedMinWords != null && (!Number.isFinite(parsedMinWords) || parsedMinWords < 0 || parsedMinWords > 5000)) return showMessage('Minimum words must be between 0 and 5,000.')
      if (parsedTargetWords != null && (!Number.isFinite(parsedTargetWords) || parsedTargetWords < 0 || parsedTargetWords > 5000)) return showMessage('Target words must be between 0 and 5,000.')
      if (parsedMinWords != null && parsedTargetWords != null && parsedTargetWords < parsedMinWords) return showMessage('Target words cannot be lower than the minimum words.')
      activityConfig = {
        writing_mode: writingMode,
        prompt: writingPrompt.trim(),
        sentence_starters: writingStarters.split('\n').map((item) => item.trim()).filter(Boolean),
        ...(parsedMinWords == null ? {} : { min_words: Math.round(parsedMinWords) }),
        ...(parsedTargetWords == null ? {} : { target_words: Math.round(parsedTargetWords) }),
        rubric_criteria: writingRubric.split('\n').map((item) => item.trim()).filter(Boolean),
      }
    } else if (newType === 'reading') {
      const parsedReadingScore = readingPassingScore.trim() ? Number(readingPassingScore) : 80
      if (!readingPassageText.trim()) return showMessage('Add a reading passage before saving a Reading Lab activity.')
      if (!readingQuestions.length) return showMessage('Add at least one Reading Lab question before saving.')
      if (!Number.isFinite(parsedReadingScore) || parsedReadingScore < 0 || parsedReadingScore > 100) return showMessage('Reading goal must be between 0 and 100%.')
      for (let index = 0; index < readingQuestions.length; index += 1) {
        const question = readingQuestions[index]
        if (!question.prompt.trim()) return showMessage('Reading question ' + (index + 1) + ' needs a prompt.')
        if (question.type === 'short_answer') {
          if (!question.correct_answer?.trim()) return showMessage('Reading question ' + (index + 1) + ' needs staff answer guidance.')
        } else {
          if (!question.correct_answer?.trim()) return showMessage('Reading question ' + (index + 1) + ' needs a correct answer.')
          if ((question.choices ?? []).filter((choice) => choice.trim()).length < 2) return showMessage('Reading question ' + (index + 1) + ' needs at least two answer choices.')
          if (!(question.choices ?? []).some((choice) => normalizeQuizText(choice) === normalizeQuizText(question.correct_answer ?? ''))) return showMessage('Reading question ' + (index + 1) + ' correct answer must match one of its choices.')
        }
      }
      activityConfig = {
        passage: readingPassageText.trim(),
        questions: readingQuestions.map((question) => ({
          ...question,
          prompt: question.prompt.trim(),
          choices: (question.choices ?? []).map((choice) => choice.trim()).filter(Boolean),
          correct_answer: question.correct_answer?.trim() || '',
          explanation: question.explanation?.trim() || '',
        })),
        passing_score: parsedReadingScore,
        show_explanations: readingShowExplanations,
      }
    }

    const values = {
      title: newTitle.trim(),
      subject: newSubject,
      assignment_type: newType,
      skill: newSkill.trim() || null,
      grade_levels: grades,
      difficulty: newDifficulty,
      delivery_format: newFormat,
      instructions: newInstructions.trim() || null,
      estimated_minutes: newMinutes ? Math.max(1, Number(newMinutes)) : null,
      resource_url: newResourceUrl.trim() || null,
      activity_config: activityConfig,
      updated_at: new Date().toISOString(),
    }

    setSaving(true)
    setMessage('')
    const result = editingAssignmentId
      ? await supabase.from('learning_assignments').update(values).eq('id', editingAssignmentId).select('id').single()
      : await supabase.from('learning_assignments').insert({ ...values, created_by: session.user.id }).select('id').single()
    setSaving(false)

    if (result.error) return showMessage(result.error.message)

    const savedId = result.data?.id as number | undefined
    await loadData()
    resetAssignmentEditor()
    setEditorOpen(false)
    if (savedId) setSelectedAssignmentId(savedId)
    setMessage(editingAssignmentId ? 'Assignment updated.' : 'Assignment added to the library.')
  }

  async function toggleAssignmentArchive(assignment: LearningAssignment) {
    if (profile?.role !== 'admin' || saving) return
    setSaving(true)
    const { error } = await supabase.from('learning_assignments')
      .update({ active: !assignment.active, updated_at: new Date().toISOString() })
      .eq('id', assignment.id)
    setSaving(false)
    if (error) return showMessage(error.message)
    await loadData()
    setMessage(assignment.active ? 'Assignment archived. Student history is unchanged.' : 'Assignment reactivated.')
  }

  async function duplicateAssignment(assignment: LearningAssignment) {
    if (!session || profile?.role !== 'admin' || saving) return
    setSaving(true)
    const { data, error } = await supabase.from('learning_assignments').insert({
      title: assignment.title + ' — Copy',
      subject: assignment.subject,
      assignment_type: assignment.assignment_type,
      skill: assignment.skill,
      grade_levels: assignment.grade_levels,
      difficulty: assignment.difficulty,
      delivery_format: assignment.delivery_format,
      instructions: assignment.instructions,
      estimated_minutes: assignment.estimated_minutes,
      resource_url: assignment.resource_url,
      activity_config: assignment.activity_config ?? {},
      active: true,
      created_by: session.user.id,
    }).select('id').single()
    setSaving(false)
    if (error) return showMessage(error.message)
    await loadData()
    if (data?.id) {
      const duplicate = { ...assignment, id: data.id as number, title: assignment.title + ' — Copy', active: true }
      setSelectedAssignmentId(data.id as number)
      beginEditAssignment(duplicate)
    }
    setMessage('Duplicate created. Make any changes, then save it.')
  }

  async function addStarterTemplates() {
    if (!session || profile?.role !== 'admin' || starterAdding) return
    const existingTitles = new Set(library.map((assignment) => assignment.title.trim().toLowerCase()))
    const missing = starterAssignments.filter((assignment) => !existingTitles.has(assignment.title.toLowerCase()))
    if (!missing.length) {
      setMessage('All starter templates are already in the library.')
      return
    }
    setStarterAdding(true)
    const { error } = await supabase.from('learning_assignments').insert(
      missing.map(({ starter_config, ...assignment }) => ({
        ...assignment,
        active: true,
        created_by: session.user.id,
        activity_config: starter_config ?? {},
      })),
    )
    setStarterAdding(false)
    if (error) return showMessage(error.message)
    await loadData()
    setMessage('Added ' + missing.length + ' starter template' + (missing.length === 1 ? '' : 's') + '.')
  }

  async function assignWork() {
    if (!session || !selectedAssignment || saving) return
    const targetChildIds = assignMode === 'child'
      ? (assignChildId ? [assignChildId] : [])
      : children.filter((child) => registrationByChild.get(child.id)?.grade === assignGrade).map((child) => child.id)

    if (!targetChildIds.length) return showMessage(assignMode === 'grade' ? 'No active students are currently registered in that grade.' : 'Choose a student first.')

    const existingKeys = new Set(weeklyAssignments.map((row) => row.child_id + ':' + row.assignment_id))
    const rows = targetChildIds
      .filter((childId) => !existingKeys.has(childId + ':' + selectedAssignment.id))
      .map((childId) => ({
        child_id: childId,
        assignment_id: selectedAssignment.id,
        week_start: weekStart,
        due_date: assignDueDate || null,
        assigned_by: session.user.id,
        updated_by: session.user.id,
      }))

    if (!rows.length) return showMessage('That assignment is already assigned to the selected student or grade for this week.')

    setSaving(true)
    const { error } = await supabase.from('learning_student_assignments').insert(rows)
    setSaving(false)
    if (error) return showMessage(error.message)

    setMessage('Assigned ' + selectedAssignment.title + ' to ' + rows.length + ' student' + (rows.length === 1 ? '' : 's') + '.')
    await loadData()
  }

  async function updateStatus(row: StudentAssignment, status: StudentAssignment['status']) {
    if (!session || saving) return
    setSaving(true)
    const { error } = await supabase.from('learning_student_assignments').update({
      status,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
      updated_by: session.user.id,
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)
    setSaving(false)
    if (error) return showMessage(error.message)
    await loadData()
  }

  async function addReadingLog() {
    if (!session || !readingChildId || saving) return
    const minutes = Number(readingMinutes)
    if (!Number.isFinite(minutes) || minutes <= 0) return showMessage('Enter the number of minutes read.')
    setSaving(true)
    const { error } = await supabase.from('learning_reading_logs').insert({
      child_id: readingChildId,
      read_on: readingDate,
      title: readingTitle.trim() || null,
      minutes: Math.round(minutes),
      pages: readingPages.trim() || null,
      note: readingNote.trim() || null,
      recorded_by: session.user.id,
    })
    setSaving(false)
    if (error) return showMessage(error.message)
    setReadingTitle('')
    setReadingPages('')
    setReadingNote('')
    setMessage('Reading time recorded.')
    await loadData()
  }

  async function addNote() {
    if (!session || !noteChildId || saving || !noteText.trim()) return
    setSaving(true)
    const { error } = await supabase.from('learning_staff_notes').insert({
      child_id: noteChildId,
      note_date: noteDate,
      note: noteText.trim(),
      created_by: session.user.id,
    })
    setSaving(false)
    if (error) return showMessage(error.message)
    setNoteText('')
    setMessage('Learning note saved.')
    await loadData()
  }

  if (loading && !session) return <main className="login-wrap"><div className="card login-card">Loading Learning Hub…</div></main>
  if (!session) return <main className="login-wrap"><section className="card login-card"><h1>Learning Hub</h1><p className="subtle">Sign in through Juanita Hub to manage student learning.</p></section></main>
  if (!profile?.active) return <main className="login-wrap"><section className="card login-card"><h1>Learning Hub</h1><div className="notice">Your staff account must be active to use Learning Hub.</div></section></main>

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Juanita Hub<small>Learning Hub</small></div>
        <div className="toolbar"><span>{profile.display_name} <span className="badge">{profile.role}</span></span></div>
      </header>

      <main className="main learning-page">
        <section className="learning-hero">
          <div>
            <span className="learning-kicker">Supplemental learning</span>
            <h1>Learning Hub</h1>
            <p>Plan the week, assign practice, record reading, and keep lightweight academic notes without turning the center into a school.</p>
          </div>
          <label className="field learning-week-picker"><span>Week of</span><input type="date" value={weekStart} onChange={(event) => event.target.value && setWeekStart(mondayFor(event.target.value))} /></label>
        </section>

        {message && <div className="notice">{message}</div>}

        {tab === 'week' && (
          <section className="learning-section">
            <div className="learning-heading"><div><span className="learning-kicker">This week</span><h2>{weekLabel(weekStart)}</h2><p>One view of assigned practice and reading activity for the week.</p></div></div>
            <div className="learning-metrics">
              <article><strong>{metrics.assigned}</strong><span>Assignments</span><small>{metrics.completed} completed</small></article>
              <article><strong>{metrics.children}</strong><span>Students active</span><small>Assignments or reading</small></article>
              <article><strong>{metrics.readingMinutes}</strong><span>Reading minutes</span><small>Recorded this week</small></article>
              <article><strong>{metrics.assigned ? Math.round((metrics.completed / metrics.assigned) * 100) : 0}%</strong><span>Completion</span><small>Across assigned work</small></article>
            </div>

            {weeklyChildren.length === 0 ? (
              <section className="card learning-empty"><span>📘</span><h2>No learning activity yet this week</h2><p>Use Assignment Library to assign work, or Reading to log time with a book.</p></section>
            ) : (
              <div className="learning-student-list">
                {weeklyChildren.map((child) => {
                  const assignments = weeklyByChild.get(child.id) ?? []
                  const logs = readingByChild.get(child.id) ?? []
                  const minutes = logs.reduce((sum, row) => sum + Number(row.minutes), 0)
                  return (
                    <article className="card learning-student-card" key={child.id}>
                      <header>
                        <span className="learning-avatar">{child.first_name[0]?.toUpperCase()}</span>
                        <span><strong>{childName(child)}</strong><small>{registrationByChild.get(child.id)?.grade ? 'Grade ' + registrationByChild.get(child.id)?.grade : 'Grade not recorded'} • {minutes} reading min</small></span>
                        <span className="learning-progress">{assignments.filter((row) => row.status === 'completed').length}/{assignments.length} done</span>
                      </header>
                      <div className="learning-assignment-list">
                        {assignments.map((row) => {
                          const assignment = assignmentById.get(row.assignment_id)
                          if (!assignment) return null
                          return (
                            <div className="learning-assignment-row" key={row.id}>
                              <span className="learning-subject-icon">{subjectIcons[assignment.subject]}</span>
                              <span className="learning-assignment-copy"><strong>{assignment.title}</strong><small>{subjectLabels[assignment.subject]}{assignment.skill ? ' • ' + assignment.skill : ''}{row.due_date ? ' • Due ' + dateLabel(row.due_date) : ''}</small>{row.status === 'completed' && (row.score != null || row.minutes_spent != null || row.staff_note) && <span className="learning-completion-meta">{row.score != null && row.max_score != null ? `Score ${row.score}/${row.max_score} • ${Math.round((row.score / row.max_score) * 100)}%` : ''}{row.score != null && row.max_score != null && row.minutes_spent != null ? ' • ' : ''}{row.minutes_spent != null ? row.minutes_spent + ' min' : ''}{(row.score != null || row.minutes_spent != null) && row.staff_note ? ' • ' : ''}{row.staff_note || ''}</span>}</span>
                              <span className={'learning-status ' + row.status}>{statusLabel(row.status)}</span>
                              <span className="learning-row-actions">
                                {assignment.assignment_type === 'typing' && <button className="primary" type="button" disabled={saving} onClick={() => setTypingTarget({ row, child, assignment })}>{row.status === 'completed' ? 'Retry typing' : 'Launch typing'}</button>}
                                {assignment.assignment_type === 'quiz' && <button className="primary" type="button" disabled={saving} onClick={() => setQuizTarget({ row, child, assignment })}>{row.status === 'completed' ? 'Retry quiz' : 'Launch quiz'}</button>}
                                {assignment.assignment_type === 'writing' && <button className="primary" type="button" disabled={saving} onClick={() => setWritingTarget({ row, child, assignment })}>{row.status === 'completed' ? 'Open writing' : row.status === 'in_progress' ? 'Continue writing' : 'Start writing'}</button>}
                                {assignment.assignment_type === 'reading' && <button className="primary" type="button" disabled={saving} onClick={() => setReadingTarget({ row, child, assignment })}>{row.status === 'completed' ? 'Retry reading' : 'Launch reading'}</button>}
                                {row.status === 'assigned' && assignment.assignment_type !== 'typing' && assignment.assignment_type !== 'quiz' && assignment.assignment_type !== 'writing' && assignment.assignment_type !== 'reading' && <button className="ghost" type="button" disabled={saving} onClick={() => void updateStatus(row, 'in_progress')}>Start</button>}
                                {row.status !== 'completed' && assignment.assignment_type !== 'typing' && assignment.assignment_type !== 'quiz' && assignment.assignment_type !== 'writing' && assignment.assignment_type !== 'reading' && <button className="primary" type="button" disabled={saving} onClick={() => setCompletionTarget({ row, child, assignment })}>Complete</button>}
                                {row.status === 'completed' && <button className="ghost" type="button" disabled={saving} onClick={() => setCompletionTarget({ row, child, assignment })}>Edit details</button>}
                                {row.status === 'completed' && <button className="ghost" type="button" disabled={saving} onClick={() => void updateStatus(row, 'assigned')}>Reopen</button>}
                              </span>
                            </div>
                          )
                        })}
                        {assignments.length === 0 && <div className="learning-inline-empty">No assignments yet — reading activity only.</div>}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {tab === 'my-week' && (
          <section className="learning-section">
            <div className="learning-heading">
              <div>
                <span className="learning-kicker">Student launch pad</span>
                <h2>My Week</h2>
                <p>Choose a student, check their weekly workload, then hand them the screen in a simplified student-only view.</p>
              </div>
            </div>

            <div className="my-week-staff-grid">
              <section className="card my-week-launch-card">
                <div className="my-week-launch-heading">
                  <span className="my-week-launch-icon">🌟</span>
                  <div><strong>Launch student view</strong><small>Only the selected child’s learning assignments will be shown.</small></div>
                </div>

                <label className="field"><span>Student</span>
                  <select value={myWeekChildId ?? ''} onChange={(event) => setMyWeekChildId(Number(event.target.value))}>
                    {children.map((child) => <option value={child.id} key={child.id}>{childName(child)}{registrationByChild.get(child.id)?.grade ? ' • Grade ' + registrationByChild.get(child.id)?.grade : ''}</option>)}
                  </select>
                </label>

                {myWeekChild ? (
                  <>
                    <div className="my-week-launch-student">
                      <span className="learning-avatar">{myWeekChild.first_name[0]?.toUpperCase()}</span>
                      <span>
                        <strong>{childName(myWeekChild)}</strong>
                        <small>{registrationByChild.get(myWeekChild.id)?.grade ? 'Grade ' + registrationByChild.get(myWeekChild.id)?.grade : 'Grade not recorded'} • {weekLabel(weekStart)}</small>
                      </span>
                    </div>

                    <div className="my-week-launch-metrics">
                      <article><strong>{myWeekItems.length}</strong><span>Assigned</span></article>
                      <article><strong>{myWeekItems.filter((item) => item.status === 'in_progress' || item.writingStatus === 'draft').length}</strong><span>In progress</span></article>
                      <article><strong>{myWeekItems.filter((item) => item.status === 'completed' || item.status === 'skipped' || item.writingStatus === 'submitted' || item.writingStatus === 'reviewed' || item.readingReviewStatus === 'pending' || item.readingReviewStatus === 'reviewed').length}</strong><span>Finished</span></article>
                    </div>

                    <button className="primary my-week-launch-button" type="button" onClick={() => setMyWeekOpen(true)}>▶ Launch {myWeekChild.first_name}’s My Week</button>
                    <p className="my-week-launch-note">The staff session stays signed in underneath. Use “Exit student view” when the child is finished.</p>
                  </>
                ) : <div className="learning-inline-empty">No active students are available.</div>}
              </section>

              <section className="card my-week-roster-card">
                <div className="section-heading"><div><h2>Student workload</h2><p className="subtle">Select a child to preview how much is on their list.</p></div></div>
                <div className="my-week-roster">
                  {children.map((child) => {
                    const rows = weeklyByChild.get(child.id) ?? []
                    const done = rows.filter((row) => row.status === 'completed' || row.status === 'skipped').length
                    const percent = rows.length ? Math.round((done / rows.length) * 100) : 0
                    return (
                      <button className={myWeekChildId === child.id ? 'active' : ''} type="button" key={child.id} onClick={() => setMyWeekChildId(child.id)}>
                        <span className="learning-avatar small">{child.first_name[0]?.toUpperCase()}</span>
                        <span><strong>{childName(child)}</strong><small>{rows.length ? done + '/' + rows.length + ' completed' : 'No assignments this week'}</small></span>
                        <em>{percent}%</em>
                      </button>
                    )
                  })}
                </div>
              </section>
            </div>
          </section>
        )}

        {tab === 'library' && (
          <section className="learning-section">
            <div className="learning-heading">
              <div>
                <span className="learning-kicker">Reusable activities</span>
                <h2>Assignment Library</h2>
                <p>Browse by grade, subject, and skill; manage reusable activities without losing student history.</p>
              </div>
              {profile.role === 'admin' && (
                <div className="learning-library-admin-actions">
                  <button className="ghost" type="button" disabled={starterAdding} onClick={() => void addStarterTemplates()}>{starterAdding ? 'Adding…' : '＋ Starter templates'}</button>
                  <button className="primary" type="button" onClick={beginAddAssignment}>＋ Add assignment</button>
                </div>
              )}
            </div>

            {profile.role === 'admin' && editorOpen && (
              <section className="card learning-create-card learning-editor-card">
                <div className="learning-editor-heading">
                  <div>
                    <span className="learning-kicker">{editingAssignmentId ? 'Edit activity' : 'New activity'}</span>
                    <h2>{editingAssignmentId ? 'Update assignment' : 'Add assignment to library'}</h2>
                  </div>
                  <button className="ghost" type="button" onClick={() => { resetAssignmentEditor(); setEditorOpen(false) }} disabled={saving}>Close</button>
                </div>
                <div className="learning-form-grid">
                  <label className="field wide"><span>Assignment title</span><input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Example: Main idea practice" /></label>
                  <label className="field"><span>Subject</span><select value={newSubject} onChange={(event) => setNewSubject(event.target.value as Subject)}>{Object.entries(subjectLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                  <label className="field"><span>Type</span><select value={newType} onChange={(event) => setNewType(event.target.value as AssignmentType)}><option value="activity">Activity</option><option value="reading">Reading</option><option value="writing">Writing</option><option value="quiz">Quiz</option><option value="typing">Typing</option><option value="worksheet">Worksheet</option><option value="practice">Practice</option></select></label>
                  <label className="field"><span>Skill</span><input value={newSkill} onChange={(event) => setNewSkill(event.target.value)} placeholder="Main idea, punctuation…" /></label>
                  <label className="field"><span>Grades</span><input value={newGrades} onChange={(event) => setNewGrades(event.target.value)} placeholder="3, 4, 5 — blank means all grades" /></label>
                  <label className="field"><span>Difficulty</span><select value={newDifficulty} onChange={(event) => setNewDifficulty(event.target.value as Difficulty)}><option value="support">Support</option><option value="standard">Standard</option><option value="challenge">Challenge</option></select></label>
                  <label className="field"><span>Format</span><select value={newFormat} onChange={(event) => setNewFormat(event.target.value as DeliveryFormat)}><option value="either">Digital or printable</option><option value="digital">Digital</option><option value="printable">Printable</option></select></label>
                  <label className="field"><span>Est. minutes</span><input type="number" min="1" max="240" value={newMinutes} onChange={(event) => setNewMinutes(event.target.value)} placeholder="20" /></label>
                  <label className="field wide"><span>Instructions</span><textarea rows={3} value={newInstructions} onChange={(event) => setNewInstructions(event.target.value)} placeholder="What should the student do?" /></label>
                  <label className="field wide"><span>Resource link <small>(optional)</small></span><input type="url" value={newResourceUrl} onChange={(event) => setNewResourceUrl(event.target.value)} placeholder="https://…" /></label>
                  {newType === 'typing' && (
                    <section className="learning-typing-editor wide">
                      <div className="learning-typing-editor-heading">
                        <span>⌨️</span>
                        <div><strong>Typing activity setup</strong><small>Choose how the child should practice, then customize the content and goal.</small></div>
                      </div>

                      <label className="field"><span>Practice mode</span>
                        <select value={typingMode} onChange={(event) => {
                          const nextMode = event.target.value as TypingMode
                          setTypingMode(nextMode)
                          if (nextMode !== 'passage' && !typingFocusKeys.trim()) setTypingFocusKeys(nextMode === 'hand_placement' ? 'a s d f g h j k l ;' : 'f j')
                        }}>
                          <option value="passage">Passage Practice — sentences & paragraphs</option>
                          <option value="letter_drill">Letter Practice — repeat selected keys</option>
                          <option value="guided_keys">Guided Keys — one highlighted key at a time</option>
                          <option value="hand_placement">Hand Placement — guided keys + finger guide</option>
                        </select>
                      </label>

                      <div className="learning-typing-mode-note">
                        {typingMode === 'passage' && <><strong>Passage Practice</strong><span>Best for students who already know the keyboard and are building speed and accuracy.</span></>}
                        {typingMode === 'letter_drill' && <><strong>Letter Practice</strong><span>Creates a drill using only the keys you choose, such as F and J or the full home row.</span></>}
                        {typingMode === 'guided_keys' && <><strong>Guided Keys</strong><span>Shows one target key at a time on an on-screen keyboard and advances only after the correct key is pressed.</span></>}
                        {typingMode === 'hand_placement' && <><strong>Hand Placement</strong><span>Shows the target key, the finger to use, home-row anchors, and an on-screen keyboard.</span></>}
                      </div>

                      {typingMode === 'passage' ? (
                        <label className="field"><span>Typing passage</span><textarea rows={7} value={typingPassage} onChange={(event) => setTypingPassage(event.target.value)} placeholder="Enter the exact passage the student should type…" /></label>
                      ) : (
                        <>
                          <label className="field"><span>Practice keys</span><input value={typingFocusKeys} onChange={(event) => setTypingFocusKeys(event.target.value)} placeholder="Example: f j   or   a s d f j k l ;" /></label>
                          <div className="learning-typing-presets">
                            <small>Quick key sets</small>
                            <div>{typingKeyPresets.map((preset) => <button className="ghost" type="button" key={preset.label} onClick={() => setTypingFocusKeys(preset.value)}>{preset.label}</button>)}</div>
                            <em>Separate keys with spaces. Type <strong>space</strong> to include the space bar.</em>
                          </div>
                          <label className="field"><span>Correct-key goal</span><input type="number" min="5" max="500" step="1" value={typingTargetKeystrokes} onChange={(event) => setTypingTargetKeystrokes(event.target.value)} placeholder="30" /></label>
                        </>
                      )}

                      <div className="learning-typing-goal-grid">
                        {(typingMode === 'passage' || typingMode === 'letter_drill') && <label className="field"><span>WPM goal <small>(optional)</small></span><input type="number" min="1" step="1" value={typingTargetWpm} onChange={(event) => setTypingTargetWpm(event.target.value)} placeholder="15" /></label>}
                        <label className="field"><span>Accuracy goal % <small>(optional)</small></span><input type="number" min="0" max="100" step="1" value={typingTargetAccuracy} onChange={(event) => setTypingTargetAccuracy(event.target.value)} placeholder="90" /></label>
                      </div>
                    </section>
                  )}
                  {newType === 'quiz' && (
                    <section className="learning-quiz-editor wide">
                      <div className="learning-quiz-editor-heading">
                        <span>🧠</span>
                        <div><strong>Quiz Builder</strong><small>Build grammar, vocabulary, spelling, or short reading-comprehension practice.</small></div>
                      </div>

                      <div className="learning-quiz-settings">
                        <label className="field"><span>Goal / passing score %</span><input type="number" min="0" max="100" step="1" value={quizPassingScore} onChange={(event) => setQuizPassingScore(event.target.value)} /></label>
                        <label className="learning-check-row"><input type="checkbox" checked={quizShowExplanations} onChange={(event) => setQuizShowExplanations(event.target.checked)} /><span>Show explanations after answers</span></label>
                      </div>

                      <div className="learning-quiz-question-list">
                        {quizQuestions.map((question, questionIndex) => (
                          <article className="learning-quiz-question-editor" key={question.id}>
                            <header>
                              <span><strong>Question {questionIndex + 1}</strong><small>{quizQuestionTypeLabels[question.type]}</small></span>
                              <span className="learning-quiz-question-actions">
                                <button className="ghost" type="button" disabled={questionIndex === 0} onClick={() => moveQuizQuestion(questionIndex, -1)}>↑</button>
                                <button className="ghost" type="button" disabled={questionIndex === quizQuestions.length - 1} onClick={() => moveQuizQuestion(questionIndex, 1)}>↓</button>
                                <button className="ghost" type="button" onClick={() => setQuizQuestions((questions) => questions.filter((item) => item.id !== question.id))}>Remove</button>
                              </span>
                            </header>

                            <div className="learning-quiz-question-grid">
                              <label className="field"><span>Question type</span><select value={question.type} onChange={(event) => changeQuizQuestionType(question.id, event.target.value as QuizQuestionType)}>{Object.entries(quizQuestionTypeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                              {question.type === 'reading_comprehension' && <label className="field wide"><span>Reading passage</span><textarea rows={5} value={question.passage ?? ''} onChange={(event) => updateQuizQuestion(question.id, { passage: event.target.value })} placeholder="Add the short passage the student should read…" /></label>}
                              <label className="field wide"><span>Question / prompt</span><textarea rows={2} value={question.prompt} onChange={(event) => updateQuizQuestion(question.id, { prompt: event.target.value })} placeholder={question.type === 'fill_blank' ? 'Example: We visit our family every ___.' : 'Type the question the student will answer…'} /></label>

                              {isQuizChoiceType(question.type) ? (
                                <div className="learning-quiz-choices wide">
                                  <span>Answer choices</span>
                                  {(question.choices ?? ['', '', '', '']).map((choice, choiceIndex) => (
                                    <label key={choiceIndex}>
                                      <input type="radio" name={'correct-' + question.id} checked={Boolean(choice.trim()) && normalizeQuizText(choice) === normalizeQuizText(question.correct_answer)} onChange={() => updateQuizQuestion(question.id, { correct_answer: choice })} />
                                      <input value={choice} onChange={(event) => updateQuizChoice(question.id, choiceIndex, event.target.value)} placeholder={'Choice ' + (choiceIndex + 1)} />
                                    </label>
                                  ))}
                                  <small>Select the radio button beside the correct choice.</small>
                                </div>
                              ) : (
                                <label className="field wide"><span>Correct answer</span><input value={question.correct_answer} onChange={(event) => updateQuizQuestion(question.id, { correct_answer: event.target.value })} placeholder={question.type === 'spelling' ? 'Correct word' : 'Answer'} /></label>
                              )}

                              <label className="field wide"><span>Explanation <small>(optional)</small></span><textarea rows={2} value={question.explanation ?? ''} onChange={(event) => updateQuizQuestion(question.id, { explanation: event.target.value })} placeholder="Explain why the answer is correct…" /></label>
                            </div>
                          </article>
                        ))}
                      </div>

                      <div className="learning-quiz-add-row">
                        <button className="primary" type="button" onClick={() => setQuizQuestions((questions) => [...questions, makeQuestion()])}>＋ Add question</button>
                        <span>{quizQuestions.length} question{quizQuestions.length === 1 ? '' : 's'}</span>
                      </div>
                    </section>
                  )}
                  {newType === 'writing' && (
                    <section className="learning-writing-editor wide">
                      <div className="learning-writing-editor-heading">
                        <span>✍️</span>
                        <div><strong>Writing Prompt Builder</strong><small>Create a guided writing activity with optional sentence starters and a simple staff rubric.</small></div>
                      </div>

                      <label className="field"><span>Writing mode</span>
                        <select value={writingMode} onChange={(event) => setWritingMode(event.target.value as WritingMode)}>
                          <option value="journal">Journal Prompt</option>
                          <option value="short_response">Short Response</option>
                          <option value="paragraph">Paragraph Writing</option>
                          <option value="creative">Creative Writing</option>
                          <option value="reading_response">Reading Response</option>
                        </select>
                      </label>

                      <label className="field"><span>Writing prompt</span><textarea rows={5} value={writingPrompt} onChange={(event) => setWritingPrompt(event.target.value)} placeholder="What should the student write about?" /></label>

                      <div className="learning-writing-word-grid">
                        <label className="field"><span>Minimum words <small>(optional)</small></span><input type="number" min="0" max="5000" step="1" value={writingMinWords} onChange={(event) => setWritingMinWords(event.target.value)} placeholder="50" /></label>
                        <label className="field"><span>Target words <small>(optional)</small></span><input type="number" min="0" max="5000" step="1" value={writingTargetWords} onChange={(event) => setWritingTargetWords(event.target.value)} placeholder="100" /></label>
                      </div>

                      <label className="field"><span>Sentence starters <small>(optional, one per line)</small></span><textarea rows={4} value={writingStarters} onChange={(event) => setWritingStarters(event.target.value)} placeholder={'One thing I noticed was…\nI think the most important part was…'} /></label>
                      <label className="field"><span>Review rubric <small>(optional, one area per line)</small></span><textarea rows={4} value={writingRubric} onChange={(event) => setWritingRubric(event.target.value)} placeholder={'Ideas\nOrganization\nGrammar & conventions'} /></label>
                    </section>
                  )}

                  {newType === 'reading' && (
                    <section className="learning-reading-editor wide">
                      <div className="learning-reading-editor-heading">
                        <span>📖</span>
                        <div><strong>Reading Comprehension Builder</strong><small>Add one passage, then mix auto-graded comprehension questions with staff-reviewed short responses.</small></div>
                      </div>

                      <label className="field"><span>Reading passage</span><textarea rows={12} value={readingPassageText} onChange={(event) => setReadingPassageText(event.target.value)} placeholder="Paste or write the passage the student should read…" /></label>

                      <div className="learning-reading-settings">
                        <label className="field"><span>Goal / passing score %</span><input type="number" min="0" max="100" step="1" value={readingPassingScore} onChange={(event) => setReadingPassingScore(event.target.value)} /></label>
                        <label className="learning-check-row"><input type="checkbox" checked={readingShowExplanations} onChange={(event) => setReadingShowExplanations(event.target.checked)} /><span>Show answer explanations after submission</span></label>
                      </div>

                      <div className="learning-reading-question-list">
                        {readingQuestions.map((question, questionIndex) => (
                          <article className="learning-reading-question-editor" key={question.id}>
                            <header>
                              <span><strong>Question {questionIndex + 1}</strong><small>{readingQuestionTypeLabels[question.type]}</small></span>
                              <span className="learning-reading-question-actions">
                                <button className="ghost" type="button" disabled={questionIndex === 0} onClick={() => moveReadingQuestion(questionIndex, -1)}>↑</button>
                                <button className="ghost" type="button" disabled={questionIndex === readingQuestions.length - 1} onClick={() => moveReadingQuestion(questionIndex, 1)}>↓</button>
                                <button className="ghost" type="button" onClick={() => setReadingQuestions((questions) => questions.filter((item) => item.id !== question.id))}>Remove</button>
                              </span>
                            </header>

                            <div className="learning-reading-question-grid">
                              <label className="field"><span>Question type</span><select value={question.type} onChange={(event) => changeReadingQuestionType(question.id, event.target.value as ReadingQuestionType)}>{Object.entries(readingQuestionTypeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                              <label className="field wide"><span>Question / prompt</span><textarea rows={2} value={question.prompt} onChange={(event) => updateReadingQuestion(question.id, { prompt: event.target.value })} placeholder="What should the student answer about the passage?" /></label>

                              {isReadingChoiceType(question.type) ? (
                                <div className="learning-reading-choices wide">
                                  <span>Answer choices</span>
                                  {(question.choices ?? ['', '', '', '']).map((choice, choiceIndex) => (
                                    <label key={choiceIndex}>
                                      <input type="radio" name={'reading-correct-' + question.id} checked={Boolean(choice.trim()) && normalizeQuizText(choice) === normalizeQuizText(question.correct_answer ?? '')} onChange={() => updateReadingQuestion(question.id, { correct_answer: choice })} />
                                      <input value={choice} onChange={(event) => updateReadingChoice(question.id, choiceIndex, event.target.value)} placeholder={'Choice ' + (choiceIndex + 1)} />
                                    </label>
                                  ))}
                                  <small>Select the correct choice. These question types are scored automatically.</small>
                                </div>
                              ) : (
                                <label className="field wide"><span>Staff answer guidance</span><textarea rows={3} value={question.correct_answer ?? ''} onChange={(event) => updateReadingQuestion(question.id, { correct_answer: event.target.value })} placeholder="What should a strong response explain or include?" /></label>
                              )}

                              {question.type !== 'short_answer' && <label className="field wide"><span>Explanation <small>(optional)</small></span><textarea rows={2} value={question.explanation ?? ''} onChange={(event) => updateReadingQuestion(question.id, { explanation: event.target.value })} placeholder="Explain why this answer is supported by the passage…" /></label>}
                            </div>
                          </article>
                        ))}
                      </div>

                      <div className="learning-reading-add-row">
                        <button className="primary" type="button" onClick={() => setReadingQuestions((questions) => [...questions, makeReadingQuestion()])}>＋ Add question</button>
                        <span>{readingQuestions.length} question{readingQuestions.length === 1 ? '' : 's'} • {readingQuestions.filter((question) => question.type === 'short_answer').length} staff-reviewed</span>
                      </div>
                    </section>
                  )}
                </div>
                <div className="learning-editor-actions">
                  <button className="ghost" type="button" disabled={saving} onClick={() => { resetAssignmentEditor(); setEditorOpen(false) }}>Cancel</button>
                  <button className="primary" type="button" disabled={saving || !newTitle.trim() || (newType === 'typing' && ((typingMode === 'passage' && !typingPassage.trim()) || (typingMode !== 'passage' && !typingFocusKeys.trim()))) || (newType === 'quiz' && quizQuestions.length === 0) || (newType === 'writing' && !writingPrompt.trim()) || (newType === 'reading' && (!readingPassageText.trim() || readingQuestions.length === 0))} onClick={() => void saveAssignment()}>{saving ? 'Saving…' : editingAssignmentId ? 'Save changes' : 'Add to library'}</button>
                </div>
              </section>
            )}

            <section className="card learning-library-browser">
              <div className="learning-library-browser-heading">
                <div><strong>{filteredLibrary.length}</strong><span>shown</span></div>
                <p>Browse path: <strong>{gradeFilter === 'all' ? 'All grades' : 'Grade ' + gradeFilter}</strong> → <strong>{subjectFilter === 'all' ? 'All subjects' : subjectLabels[subjectFilter]}</strong> → <strong>{skillFilter === 'all' ? 'All skills' : skillFilter}</strong></p>
              </div>
              <div className="learning-library-filters v2">
                <label className="field search"><span>Search</span><input type="search" value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Title, skill, or instructions…" /></label>
                <label className="field"><span>Grade</span><select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)}><option value="all">All grades</option>{gradeOptions.map((grade) => <option value={grade} key={grade}>Grade {grade}</option>)}</select></label>
                <label className="field"><span>Subject</span><select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value as typeof subjectFilter)}><option value="all">All subjects</option>{Object.entries(subjectLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label className="field"><span>Skill</span><select value={skillFilter} onChange={(event) => setSkillFilter(event.target.value)}><option value="all">All skills</option>{skillOptions.map((skill) => <option value={skill} key={skill}>{skill}</option>)}</select></label>
                <label className="field"><span>Difficulty</span><select value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value as typeof difficultyFilter)}><option value="all">All levels</option><option value="support">Support</option><option value="standard">Standard</option><option value="challenge">Challenge</option></select></label>
                <label className="field"><span>Format</span><select value={formatFilter} onChange={(event) => setFormatFilter(event.target.value as typeof formatFilter)}><option value="all">All formats</option><option value="digital">Digital</option><option value="printable">Printable</option><option value="either">Either</option></select></label>
                <label className="field"><span>Status</span><select value={libraryStatusFilter} onChange={(event) => setLibraryStatusFilter(event.target.value as typeof libraryStatusFilter)}><option value="active">Active</option><option value="archived">Archived</option><option value="all">Active + archived</option></select></label>
                <button className="ghost learning-filter-clear" type="button" onClick={() => { setLibrarySearch(''); setGradeFilter('all'); setSubjectFilter('all'); setSkillFilter('all'); setDifficultyFilter('all'); setFormatFilter('all'); setLibraryStatusFilter('active') }}>Clear filters</button>
              </div>
            </section>

            <div className="learning-library-layout v2">
              <section className="card learning-library-card">
                <div className="learning-library-groups">
                  {libraryGroups.map((group) => (
                    <section className="learning-library-subject-group" key={group.subject}>
                      <div className="learning-library-subject-heading"><span>{subjectIcons[group.subject]}</span><strong>{subjectLabels[group.subject]}</strong><small>{group.skills.reduce((sum, skill) => sum + skill.assignments.length, 0)} activities</small></div>
                      {group.skills.map((skillGroup) => (
                        <div className="learning-library-skill-group" key={group.subject + ':' + skillGroup.skill}>
                          <div className="learning-library-skill-heading"><span>{skillGroup.skill}</span><small>{skillGroup.assignments.length}</small></div>
                          <div className="learning-library-list">
                            {skillGroup.assignments.map((assignment) => {
                              const usage = usageByAssignment.get(assignment.id) ?? { assigned: 0, completed: 0 }
                              return (
                                <article className={'learning-library-item-v2 ' + (selectedAssignmentId === assignment.id ? 'selected ' : '') + (!assignment.active ? 'archived' : '')} key={assignment.id}>
                                  <button className="learning-library-select" type="button" onClick={() => setSelectedAssignmentId(assignment.id)}>
                                    <span className="learning-subject-icon">{subjectIcons[assignment.subject]}</span>
                                    <span className="learning-library-item-copy">
                                      <span className="learning-library-title-row"><strong>{assignment.title}</strong>{!assignment.active && <em>Archived</em>}</span>
                                      <small>{assignment.grade_levels.length ? 'Grades ' + assignment.grade_levels.join(', ') : 'All grades'} • {assignment.delivery_format} • {assignment.difficulty}</small>
                                      <span className="learning-library-usage">{usage.assigned} assigned • {usage.completed} completed{usage.assigned ? ' • ' + Math.round((usage.completed / usage.assigned) * 100) + '% completion' : ''}</span>
                                    </span>
                                  </button>
                                  {profile.role === 'admin' && (
                                    <div className="learning-library-item-actions">
                                      <button className="ghost" type="button" onClick={() => setPreviewAssignment(assignment)}>Preview</button>
                                      <button className="ghost" type="button" onClick={() => setTestAssignment(assignment)}>▶ Test</button>
                                      <button className="ghost" type="button" disabled={saving} onClick={() => beginEditAssignment(assignment)}>Edit</button>
                                      <button className="ghost" type="button" disabled={saving} onClick={() => void duplicateAssignment(assignment)}>Duplicate</button>
                                      <button className="ghost" type="button" disabled={saving} onClick={() => void toggleAssignmentArchive(assignment)}>{assignment.active ? 'Archive' : 'Reactivate'}</button>
                                    </div>
                                  )}
                                </article>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </section>
                  ))}
                  {filteredLibrary.length === 0 && <div className="learning-inline-empty">No assignments match these filters yet.</div>}
                </div>
              </section>

              <aside className="card learning-assign-card">
                <span className="learning-kicker">Assignment details</span>
                <h2>{selectedAssignment?.title ?? 'Choose an assignment'}</h2>
                {selectedAssignment ? <>
                  <p>{selectedAssignment.instructions || 'No additional instructions.'}</p>
                  <div className="learning-selected-meta">
                    <span>{subjectLabels[selectedAssignment.subject]}</span>
                    <span>{selectedAssignment.skill || 'General skill'}</span>
                    <span>{selectedAssignment.delivery_format}</span>
                    <span>{selectedAssignment.difficulty}</span>
                    <span>{selectedAssignment.estimated_minutes ? selectedAssignment.estimated_minutes + ' min' : 'No time estimate'}</span>
                    <span>{selectedAssignment.grade_levels.length ? 'Grades ' + selectedAssignment.grade_levels.join(', ') : 'All grades'}</span>
                  </div>
                  {selectedAssignment.assignment_type === 'typing' && (
                    <div className="learning-typing-details">
                      <span>⌨️ {typingModeLabels[selectedAssignment.activity_config?.mode ?? 'passage']}</span>
                      {(selectedAssignment.activity_config?.mode ?? 'passage') === 'passage'
                        ? <strong>{selectedAssignment.activity_config?.passage?.length ?? 0} characters</strong>
                        : <>
                            <strong>{selectedAssignment.activity_config?.target_keystrokes ?? 30} correct keys</strong>
                            <small>{(selectedAssignment.activity_config?.focus_keys ?? []).map((key) => key === ' ' ? 'Space' : key.toUpperCase()).join(', ') || 'No keys selected'}</small>
                          </>}
                      {typeof selectedAssignment.activity_config?.target_wpm === 'number' && <small>{selectedAssignment.activity_config.target_wpm} WPM goal</small>}
                      {typeof selectedAssignment.activity_config?.target_accuracy === 'number' && <small>{selectedAssignment.activity_config.target_accuracy}% accuracy goal</small>}
                    </div>
                  )}
                  {selectedAssignment.assignment_type === 'quiz' && (
                    <div className="learning-quiz-details">
                      <span>🧠 Quiz Lab ready</span>
                      <strong>{selectedAssignment.activity_config?.questions?.length ?? 0} questions</strong>
                      <small>Goal {selectedAssignment.activity_config?.passing_score ?? 80}%</small>
                      <small>{selectedAssignment.activity_config?.show_explanations === false ? 'Explanations hidden' : 'Answer explanations on'}</small>
                    </div>
                  )}
                  {selectedAssignment.assignment_type === 'writing' && (
                    <div className="learning-writing-details">
                      <span>✍️ Writing Lab ready</span>
                      <strong>{selectedAssignment.activity_config?.writing_mode ? selectedAssignment.activity_config.writing_mode.replaceAll('_', ' ') : 'Writing prompt'}</strong>
                      {typeof selectedAssignment.activity_config?.min_words === 'number' && <small>Minimum {selectedAssignment.activity_config.min_words} words</small>}
                      {typeof selectedAssignment.activity_config?.target_words === 'number' && <small>Target {selectedAssignment.activity_config.target_words} words</small>}
                      <small>{selectedAssignment.activity_config?.rubric_criteria?.length ?? 0} review areas</small>
                    </div>
                  )}
                  {selectedAssignment.assignment_type === 'reading' && (
                    <div className="learning-reading-details">
                      <span>📖 Reading Lab ready</span>
                      <strong>{selectedAssignment.activity_config?.questions?.length ?? 0} questions</strong>
                      <small>{selectedAssignment.activity_config?.passage?.split(/\s+/).filter(Boolean).length ?? 0} passage words</small>
                      <small>{(selectedAssignment.activity_config?.questions ?? []).filter((question) => question.type === 'short_answer').length} staff-reviewed</small>
                      <small>Goal {selectedAssignment.activity_config?.passing_score ?? 80}%</small>
                    </div>
                  )}
                  {selectedAssignment.resource_url && <a className="learning-resource-link" href={selectedAssignment.resource_url} target="_blank" rel="noreferrer">Open resource ↗</a>}

                  <div className="learning-preview-actions">
                    <button className="ghost" type="button" onClick={() => setPreviewAssignment(selectedAssignment)}>👁 Preview setup</button>
                    <button className="primary" type="button" onClick={() => setTestAssignment(selectedAssignment)}>▶ Test activity</button>
                  </div>

                  {profile.role === 'admin' && (
                    <div className="learning-selected-admin-actions">
                      <button className="ghost" type="button" onClick={() => beginEditAssignment(selectedAssignment)}>Edit</button>
                      <button className="ghost" type="button" onClick={() => void duplicateAssignment(selectedAssignment)}>Duplicate</button>
                      <button className="ghost" type="button" onClick={() => void toggleAssignmentArchive(selectedAssignment)}>{selectedAssignment.active ? 'Archive' : 'Reactivate'}</button>
                    </div>
                  )}

                  {selectedAssignment.active ? <>
                    <div className="learning-assign-divider" />
                    <span className="learning-kicker">Assign this week</span>
                    <div className="learning-toggle">
                      <button type="button" className={assignMode === 'child' ? 'active' : ''} onClick={() => setAssignMode('child')}>One student</button>
                      <button type="button" className={assignMode === 'grade' ? 'active' : ''} onClick={() => setAssignMode('grade')}>Whole grade</button>
                    </div>
                    {assignMode === 'child'
                      ? <label className="field"><span>Student</span><select value={assignChildId ?? ''} onChange={(event) => setAssignChildId(Number(event.target.value))}>{children.map((child) => <option value={child.id} key={child.id}>{childName(child)}{registrationByChild.get(child.id)?.grade ? ' — Grade ' + registrationByChild.get(child.id)?.grade : ''}</option>)}</select></label>
                      : <label className="field"><span>Grade</span><select value={assignGrade} onChange={(event) => setAssignGrade(event.target.value)}>{gradeOptions.map((grade) => <option value={grade} key={grade}>Grade {grade}</option>)}</select></label>}
                    <label className="field"><span>Week</span><input type="date" value={weekStart} onChange={(event) => event.target.value && setWeekStart(mondayFor(event.target.value))} /></label>
                    <label className="field"><span>Due date <small>(optional)</small></span><input type="date" value={assignDueDate} onChange={(event) => setAssignDueDate(event.target.value)} /></label>

                    <div className={'learning-assignment-preview ' + (assignmentPreview.willAssign ? 'ready' : 'already')}>
                      {assignMode === 'grade'
                        ? <><strong>{assignmentPreview.willAssign}</strong><span>of {assignmentPreview.total} Grade {assignGrade || '—'} students will receive this assignment.</span>{assignmentPreview.already > 0 && <small>{assignmentPreview.already} already assigned for this week.</small>}</>
                        : <><strong>{assignmentPreview.already ? 'Already assigned' : assignmentPreview.total ? 'Ready to assign' : 'Choose a student'}</strong><span>{assignmentPreview.already ? 'This student already has the activity this week.' : assignmentPreview.total ? 'This assignment will be added to the selected student.' : 'Select a student to preview the assignment.'}</span></>}
                    </div>

                    <button className="primary" type="button" disabled={saving || assignmentPreview.willAssign === 0} onClick={() => void assignWork()}>{saving ? 'Assigning…' : assignMode === 'grade' ? 'Assign to ' + assignmentPreview.willAssign + ' student' + (assignmentPreview.willAssign === 1 ? '' : 's') : 'Assign to student'}</button>
                  </> : (
                    <div className="learning-archived-message"><strong>Archived assignment</strong><p>This activity stays in student history but cannot be newly assigned until it is reactivated.</p></div>
                  )}
                </> : <div className="learning-inline-empty">Select an assignment from the library to view details and assign it for {weekLabel(weekStart)}.</div>}
              </aside>
            </div>
          </section>
        )}

        {tab === 'typing' && (
          <section className="learning-section">
            <div className="learning-heading">
              <div>
                <span className="learning-kicker">Interactive practice</span>
                <h2>Typing Lab</h2>
                <p>Launch assigned typing activities and automatically save WPM, accuracy, time, and completion results.</p>
              </div>
            </div>

            <div className="learning-metrics">
              <article><strong>{typingSummary.assigned}</strong><span>Typing assignments</span><small>{typingSummary.completed} completed this week</small></article>
              <article><strong>{typingSummary.attempts}</strong><span>Attempts</span><small>Saved for this week’s typing work</small></article>
              <article><strong>{typingSummary.speedAttempts ? typingSummary.averageWpm.toFixed(1) : '—'}</strong><span>Average WPM</span><small>{typingSummary.speedAttempts} passage/letter attempts</small></article>
              <article><strong>{typingSummary.attempts ? typingSummary.averageAccuracy.toFixed(1) + '%' : '—'}</strong><span>Average accuracy</span><small>Across saved attempts</small></article>
            </div>

            {weeklyTypingAssignments.length === 0 ? (
              <section className="card learning-empty">
                <span>⌨️</span>
                <h2>No typing assignments this week</h2>
                <p>Assign a typing activity from Assignment Library, then it will appear here ready to launch.</p>
                <button className="primary" type="button" onClick={() => { window.location.hash = 'library'; setTab('library'); setSubjectFilter('typing') }}>Open typing assignments</button>
              </section>
            ) : (
              <div className="typing-lab-grid">
                <section className="card typing-lab-assignments">
                  <div className="section-heading"><div><h2>{weekLabel(weekStart)}</h2><p className="subtle">Assigned typing activities</p></div></div>
                  <div className="typing-lab-list">
                    {weeklyTypingAssignments.map((row) => {
                      const assignment = assignmentById.get(row.assignment_id)
                      const child = childById.get(row.child_id)
                      if (!assignment || !child) return null
                      const attempts = weeklyTypingAttempts.filter((attempt) => attempt.student_assignment_id === row.id)
                      const latest = attempts[0]
                      return (
                        <article key={row.id}>
                          <span className="learning-avatar">{child.first_name[0]?.toUpperCase()}</span>
                          <span className="typing-lab-row-copy">
                            <strong>{childName(child)}</strong>
                            <small>{assignment.title} • {typingModeLabels[assignment.activity_config?.mode ?? 'passage']}{registrationByChild.get(child.id)?.grade ? ' • Grade ' + registrationByChild.get(child.id)?.grade : ''}</small>
                            {latest && <em>Latest: {(latest.activity_mode === 'passage' || latest.activity_mode === 'letter_drill') ? Number(latest.wpm).toFixed(1) + ' WPM • ' : latest.correct_characters + ' correct • '}{Number(latest.accuracy).toFixed(1)}% accuracy</em>}
                          </span>
                          <span className={'learning-status ' + row.status}>{statusLabel(row.status)}</span>
                          <button className="primary" type="button" onClick={() => setTypingTarget({ row, child, assignment })}>{attempts.length ? 'Try again' : 'Launch'}</button>
                        </article>
                      )
                    })}
                  </div>
                </section>

                <section className="card typing-attempt-history">
                  <div className="section-heading"><div><h2>Recent results</h2><p className="subtle">Typing attempts for the selected week.</p></div><span className="badge">{weeklyTypingAttempts.length}</span></div>
                  <div className="typing-history-list">
                    {weeklyTypingAttempts.slice(0, 12).map((attempt) => {
                      const child = childById.get(attempt.child_id)
                      const assignment = assignmentById.get(attempt.assignment_id)
                      return (
                        <article key={attempt.id}>
                          <span><strong>{child ? childName(child) : 'Student'}</strong><small>{assignment?.title ?? 'Typing activity'} • {typingModeLabels[attempt.activity_mode ?? 'passage']} • {new Date(attempt.created_at).toLocaleDateString()}</small></span>
                          <span>
                            <strong>{(attempt.activity_mode === 'passage' || attempt.activity_mode === 'letter_drill') ? Number(attempt.wpm).toFixed(1) + ' WPM' : attempt.correct_characters + ' correct keys'}</strong>
                            <small>{Number(attempt.accuracy).toFixed(1)}% • {Math.max(1, Math.ceil(attempt.duration_seconds / 60))} min • {Object.values(attempt.mistake_counts ?? {}).reduce((sum, count) => sum + Number(count), 0)} mistakes</small>
                          </span>
                        </article>
                      )
                    })}
                    {weeklyTypingAttempts.length === 0 && <div className="learning-inline-empty">No typing attempts have been completed for this week yet.</div>}
                  </div>
                </section>
              </div>
            )}
          </section>
        )}

        {tab === 'quizzes' && (
          <section className="learning-section">
            <div className="learning-heading">
              <div>
                <span className="learning-kicker">Interactive practice</span>
                <h2>Quiz Lab</h2>
                <p>Run grammar, vocabulary, spelling, and reading-comprehension quizzes with automatic scoring and saved attempt history.</p>
              </div>
            </div>

            <div className="learning-metrics">
              <article><strong>{quizSummary.assigned}</strong><span>Quiz assignments</span><small>{quizSummary.completed} completed this week</small></article>
              <article><strong>{quizSummary.attempts}</strong><span>Attempts</span><small>Saved for this week’s quizzes</small></article>
              <article><strong>{quizSummary.attempts ? quizSummary.averagePercent.toFixed(1) + '%' : '—'}</strong><span>Average score</span><small>Across saved attempts</small></article>
              <article><strong>{quizSummary.assigned ? Math.round((quizSummary.completed / quizSummary.assigned) * 100) + '%' : '0%'}</strong><span>Completion</span><small>Assigned quizzes completed</small></article>
            </div>

            {weeklyQuizAssignments.length === 0 ? (
              <section className="card learning-empty">
                <span>🧠</span>
                <h2>No quizzes assigned this week</h2>
                <p>Create or choose a Quiz assignment in Assignment Library, then assign it to a student or grade.</p>
                <button className="primary" type="button" onClick={() => { window.location.hash = 'library'; setTab('library'); setSubjectFilter('grammar') }}>Open quiz assignments</button>
              </section>
            ) : (
              <div className="quiz-lab-grid">
                <section className="card quiz-lab-assignments">
                  <div className="section-heading"><div><h2>{weekLabel(weekStart)}</h2><p className="subtle">Assigned quizzes</p></div></div>
                  <div className="quiz-lab-list">
                    {weeklyQuizAssignments.map((row) => {
                      const assignment = assignmentById.get(row.assignment_id)
                      const child = childById.get(row.child_id)
                      if (!assignment || !child) return null
                      const attempts = weeklyQuizAttempts.filter((attempt) => attempt.student_assignment_id === row.id)
                      const latest = attempts[0]
                      return (
                        <article key={row.id}>
                          <span className="learning-avatar">{child.first_name[0]?.toUpperCase()}</span>
                          <span className="quiz-lab-row-copy">
                            <strong>{childName(child)}</strong>
                            <small>{assignment.title} • {assignment.activity_config?.questions?.length ?? 0} questions{registrationByChild.get(child.id)?.grade ? ' • Grade ' + registrationByChild.get(child.id)?.grade : ''}</small>
                            {latest && <em>Latest: {latest.correct_count}/{latest.question_count} • {Number(latest.percent).toFixed(1)}%</em>}
                          </span>
                          <span className={'learning-status ' + row.status}>{statusLabel(row.status)}</span>
                          <button className="primary" type="button" onClick={() => setQuizTarget({ row, child, assignment })}>{attempts.length ? 'Try again' : 'Launch'}</button>
                        </article>
                      )
                    })}
                  </div>
                </section>

                <section className="card quiz-attempt-history">
                  <div className="section-heading"><div><h2>Recent results</h2><p className="subtle">Quiz attempts for the selected week.</p></div><span className="badge">{weeklyQuizAttempts.length}</span></div>
                  <div className="quiz-history-list">
                    {weeklyQuizAttempts.slice(0, 12).map((attempt) => {
                      const child = childById.get(attempt.child_id)
                      const assignment = assignmentById.get(attempt.assignment_id)
                      return (
                        <article key={attempt.id}>
                          <span><strong>{child ? childName(child) : 'Student'}</strong><small>{assignment?.title ?? 'Quiz'} • {new Date(attempt.created_at).toLocaleDateString()}</small></span>
                          <span><strong>{attempt.correct_count}/{attempt.question_count}</strong><small>{Number(attempt.percent).toFixed(1)}% • {Math.max(1, Math.ceil(attempt.duration_seconds / 60))} min</small></span>
                        </article>
                      )
                    })}
                    {weeklyQuizAttempts.length === 0 && <div className="learning-inline-empty">No quiz attempts have been completed for this week yet.</div>}
                  </div>
                </section>
              </div>
            )}
          </section>
        )}

        {tab === 'writing' && (
          <section className="learning-section">
            <div className="learning-heading">
              <div>
                <span className="learning-kicker">Written expression</span>
                <h2>Writing Lab</h2>
                <p>Launch guided writing prompts, resume drafts, and review submitted work with lightweight feedback and an optional rubric.</p>
              </div>
            </div>

            <div className="learning-metrics">
              <article><strong>{writingSummary.assigned}</strong><span>Writing assignments</span><small>{writingSummary.drafts} drafts in progress</small></article>
              <article><strong>{writingSummary.submitted}</strong><span>Awaiting review</span><small>Submitted this week</small></article>
              <article><strong>{writingSummary.reviewed}</strong><span>Reviewed</span><small>Feedback completed</small></article>
              <article><strong>{writingSummary.words}</strong><span>Words written</span><small>Across saved writing this week</small></article>
            </div>

            {weeklyWritingAssignments.length === 0 ? (
              <section className="card learning-empty">
                <span>✍️</span>
                <h2>No writing assignments this week</h2>
                <p>Assign a Writing activity from Assignment Library, then drafts and submissions will appear here.</p>
                <button className="primary" type="button" onClick={() => { window.location.hash = 'library'; setTab('library'); setSubjectFilter('writing') }}>Open writing assignments</button>
              </section>
            ) : (
              <div className="writing-lab-grid">
                <section className="card writing-lab-assignments">
                  <div className="section-heading"><div><h2>{weekLabel(weekStart)}</h2><p className="subtle">Assigned writing activities</p></div></div>
                  <div className="writing-lab-list">
                    {weeklyWritingAssignments.map((row) => {
                      const assignment = assignmentById.get(row.assignment_id)
                      const child = childById.get(row.child_id)
                      if (!assignment || !child) return null
                      const submission = weeklyWritingSubmissions.find((item) => item.student_assignment_id === row.id)
                      return (
                        <article key={row.id}>
                          <span className="learning-avatar">{child.first_name[0]?.toUpperCase()}</span>
                          <span className="writing-lab-row-copy">
                            <strong>{childName(child)}</strong>
                            <small>{assignment.title}{registrationByChild.get(child.id)?.grade ? ' • Grade ' + registrationByChild.get(child.id)?.grade : ''}</small>
                            {submission && <em>{submission.word_count} words • {submission.status === 'draft' ? 'Draft saved' : submission.status === 'submitted' ? 'Awaiting review' : 'Reviewed'}</em>}
                          </span>
                          <span className={'learning-status ' + row.status}>{submission?.status === 'submitted' ? 'Submitted' : submission?.status === 'reviewed' ? 'Reviewed' : statusLabel(row.status)}</span>
                          <span className="writing-lab-row-actions">
                            <button className="primary" type="button" onClick={() => setWritingTarget({ row, child, assignment })}>{submission?.status === 'draft' ? 'Continue' : submission ? 'Open writing' : 'Launch'}</button>
                            {submission && submission.status !== 'draft' && <button className="ghost" type="button" onClick={() => setWritingReviewTarget({ submission, child, assignment })}>{submission.status === 'reviewed' ? 'Edit review' : 'Review'}</button>}
                          </span>
                        </article>
                      )
                    })}
                  </div>
                </section>

                <section className="card writing-review-queue">
                  <div className="section-heading"><div><h2>Review queue</h2><p className="subtle">Submitted writing that is ready for staff feedback.</p></div><span className="badge">{weeklyWritingSubmissions.filter((item) => item.status === 'submitted').length}</span></div>
                  <div className="writing-review-list">
                    {weeklyWritingSubmissions.filter((item) => item.status === 'submitted').map((submission) => {
                      const child = childById.get(submission.child_id)
                      const assignment = assignmentById.get(submission.assignment_id)
                      if (!child || !assignment) return null
                      return (
                        <article key={submission.id}>
                          <span><strong>{childName(child)}</strong><small>{assignment.title} • {submission.word_count} words{submission.submitted_at ? ' • ' + new Date(submission.submitted_at).toLocaleDateString() : ''}</small></span>
                          <button className="primary" type="button" onClick={() => setWritingReviewTarget({ submission, child, assignment })}>Review</button>
                        </article>
                      )
                    })}
                    {weeklyWritingSubmissions.filter((item) => item.status === 'submitted').length === 0 && <div className="learning-inline-empty">Nothing is waiting for review right now.</div>}
                  </div>

                  {weeklyWritingSubmissions.filter((item) => item.status === 'reviewed').length > 0 && <>
                    <div className="writing-reviewed-heading"><strong>Recently reviewed</strong><span>{weeklyWritingSubmissions.filter((item) => item.status === 'reviewed').length}</span></div>
                    <div className="writing-review-list reviewed">
                      {weeklyWritingSubmissions.filter((item) => item.status === 'reviewed').slice(0, 8).map((submission) => {
                        const child = childById.get(submission.child_id)
                        const assignment = assignmentById.get(submission.assignment_id)
                        if (!child || !assignment) return null
                        return (
                          <article key={submission.id}>
                            <span><strong>{childName(child)}</strong><small>{assignment.title} • {submission.word_count} words</small></span>
                            <button className="ghost" type="button" onClick={() => setWritingReviewTarget({ submission, child, assignment })}>View review</button>
                          </article>
                        )
                      })}
                    </div>
                  </>}
                </section>
              </div>
            )}
          </section>
        )}

        {tab === 'reading' && (
          <section className="learning-section">
            <div className="learning-heading">
              <div>
                <span className="learning-kicker">Reading practice</span>
                <h2>Reading Lab</h2>
                <p>Run comprehension activities with the passage kept in view, review written responses, and keep the existing lightweight reading log in the same workspace.</p>
              </div>
            </div>

            <div className="learning-metrics">
              <article><strong>{readingLabSummary.assigned}</strong><span>Comprehension assignments</span><small>{readingLabSummary.attempts} attempts this week</small></article>
              <article><strong>{readingLabSummary.pending}</strong><span>Awaiting review</span><small>Written responses</small></article>
              <article><strong>{readingLabSummary.autoAttempts ? readingLabSummary.autoAverage.toFixed(1) + '%' : '—'}</strong><span>Auto-graded average</span><small>{readingLabSummary.autoAttempts} fully objective attempts</small></article>
              <article><strong>{metrics.readingMinutes}</strong><span>Reading log minutes</span><small>Books and independent reading</small></article>
            </div>

            {weeklyReadingAssignments.length === 0 ? (
              <section className="card learning-empty">
                <span>📖</span>
                <h2>No comprehension assignments this week</h2>
                <p>Assign a Reading activity from Assignment Library to launch the new Reading Lab. You can still record independent reading below.</p>
                <button className="primary" type="button" onClick={() => { window.location.hash = 'library'; setTab('library'); setSubjectFilter('reading') }}>Open reading assignments</button>
              </section>
            ) : (
              <div className="reading-lab-staff-grid">
                <section className="card reading-lab-assignments">
                  <div className="section-heading"><div><h2>{weekLabel(weekStart)}</h2><p className="subtle">Assigned comprehension activities</p></div></div>
                  <div className="reading-lab-staff-list">
                    {weeklyReadingAssignments.map((row) => {
                      const assignment = assignmentById.get(row.assignment_id)
                      const child = childById.get(row.child_id)
                      if (!assignment || !child) return null
                      const attempts = weeklyReadingAttempts.filter((attempt) => attempt.student_assignment_id === row.id)
                      const latest = attempts[0]
                      const writtenEarned = latest?.review_status === 'reviewed'
                        ? Object.values(latest.review_scores ?? {}).reduce((sum, value) => sum + Number(value), 0)
                        : 0
                      const earned = latest ? Number(latest.objective_correct) + writtenEarned : 0
                      const max = latest ? Number(latest.objective_count) + Number(latest.written_count) : 0
                      return (
                        <article key={row.id}>
                          <span className="learning-avatar">{child.first_name[0]?.toUpperCase()}</span>
                          <span className="reading-lab-row-copy">
                            <strong>{childName(child)}</strong>
                            <small>{assignment.title} • {assignment.activity_config?.questions?.length ?? 0} questions{registrationByChild.get(child.id)?.grade ? ' • Grade ' + registrationByChild.get(child.id)?.grade : ''}</small>
                            {latest && <em>{latest.review_status === 'pending' ? latest.objective_correct + '/' + latest.objective_count + ' objective • awaiting written review' : max ? earned + '/' + max + ' • ' + Math.round((earned / max) * 100) + '%' : 'Attempt saved'}</em>}
                          </span>
                          <span className={'learning-status ' + row.status}>{latest?.review_status === 'pending' ? 'Submitted' : latest?.review_status === 'reviewed' ? 'Reviewed' : statusLabel(row.status)}</span>
                          <span className="reading-lab-row-actions">
                            <button className="primary" type="button" onClick={() => setReadingTarget({ row, child, assignment })}>{attempts.length ? 'Try again' : 'Launch'}</button>
                            {latest && latest.written_count > 0 && <button className="ghost" type="button" onClick={() => setReadingReviewTarget({ attempt: latest, child, assignment })}>{latest.review_status === 'reviewed' ? 'View review' : 'Review'}</button>}
                          </span>
                        </article>
                      )
                    })}
                  </div>
                </section>

                <section className="card reading-review-queue">
                  <div className="section-heading"><div><h2>Response review</h2><p className="subtle">Short responses that need staff judgment.</p></div><span className="badge">{weeklyReadingAttempts.filter((attempt) => attempt.review_status === 'pending').length}</span></div>
                  <div className="reading-review-queue-list">
                    {weeklyReadingAttempts.filter((attempt) => attempt.review_status === 'pending').map((attempt) => {
                      const child = childById.get(attempt.child_id)
                      const assignment = assignmentById.get(attempt.assignment_id)
                      if (!child || !assignment) return null
                      return (
                        <article key={attempt.id}>
                          <span><strong>{childName(child)}</strong><small>{assignment.title} • {attempt.objective_correct}/{attempt.objective_count} objective correct • {attempt.written_count} written</small></span>
                          <button className="primary" type="button" onClick={() => setReadingReviewTarget({ attempt, child, assignment })}>Review</button>
                        </article>
                      )
                    })}
                    {weeklyReadingAttempts.filter((attempt) => attempt.review_status === 'pending').length === 0 && <div className="learning-inline-empty">No reading responses are waiting for review.</div>}
                  </div>

                  <div className="reading-recent-heading"><strong>Recent attempts</strong><span>{weeklyReadingAttempts.length}</span></div>
                  <div className="reading-review-queue-list recent">
                    {weeklyReadingAttempts.slice(0, 8).map((attempt) => {
                      const child = childById.get(attempt.child_id)
                      const assignment = assignmentById.get(attempt.assignment_id)
                      if (!child || !assignment) return null
                      const reviewEarned = attempt.review_status === 'reviewed' ? Object.values(attempt.review_scores ?? {}).reduce((sum, value) => sum + Number(value), 0) : 0
                      const earned = Number(attempt.objective_correct) + reviewEarned
                      const max = Number(attempt.objective_count) + Number(attempt.written_count)
                      return (
                        <article key={attempt.id}>
                          <span><strong>{childName(child)}</strong><small>{assignment.title} • {new Date(attempt.created_at).toLocaleDateString()}</small></span>
                          <span className="reading-attempt-result"><strong>{attempt.review_status === 'pending' ? 'Review' : max ? earned + '/' + max : 'Saved'}</strong><small>{Math.max(1, Math.ceil(attempt.duration_seconds / 60))} min</small></span>
                        </article>
                      )
                    })}
                    {weeklyReadingAttempts.length === 0 && <div className="learning-inline-empty">No comprehension attempts yet.</div>}
                  </div>
                </section>
              </div>
            )}

            <section className="reading-log-divider">
              <div><span className="learning-kicker">Independent reading</span><h2>Reading Log</h2><p>Keep tracking books and reading minutes that do not need a full comprehension assignment.</p></div>
            </section>

            <div className="learning-two-column">
              <section className="card">
                <h2>Record reading</h2>
                <label className="field"><span>Student</span><select value={readingChildId ?? ''} onChange={(event) => setReadingChildId(Number(event.target.value))}>{children.map((child) => <option value={child.id} key={child.id}>{childName(child)}</option>)}</select></label>
                <div className="learning-form-grid">
                  <label className="field"><span>Date</span><input type="date" value={readingDate} onChange={(event) => setReadingDate(event.target.value)} /></label>
                  <label className="field"><span>Minutes</span><input type="number" min="1" max="600" value={readingMinutes} onChange={(event) => setReadingMinutes(event.target.value)} /></label>
                  <label className="field wide"><span>Book / text</span><input value={readingTitle} onChange={(event) => setReadingTitle(event.target.value)} placeholder="Optional title" /></label>
                  <label className="field"><span>Pages</span><input value={readingPages} onChange={(event) => setReadingPages(event.target.value)} placeholder="12–24" /></label>
                  <label className="field wide"><span>Note</span><textarea rows={3} value={readingNote} onChange={(event) => setReadingNote(event.target.value)} placeholder="Optional reading note" /></label>
                </div>
                <button className="primary" type="button" disabled={saving || !readingChildId} onClick={() => void addReadingLog()}>{saving ? 'Saving…' : 'Record reading'}</button>
              </section>

              <section className="card">
                <div className="section-heading"><div><h2>{weekLabel(weekStart)}</h2><p className="subtle">{metrics.readingMinutes} total minutes recorded.</p></div></div>
                <div className="learning-log-list">
                  {readingLogs.map((row) => {
                    const child = childById.get(row.child_id)
                    return <article key={row.id}><span className="learning-avatar small">{child?.first_name[0]?.toUpperCase() ?? '?'}</span><span><strong>{child ? childName(child) : 'Student'} • {row.minutes} min</strong><small>{dateLabel(row.read_on)}{row.title ? ' • ' + row.title : ''}{row.pages ? ' • pages ' + row.pages : ''}</small>{row.note && <p>{row.note}</p>}</span></article>
                  })}
                  {readingLogs.length === 0 && <div className="learning-inline-empty">No reading has been recorded for this week yet.</div>}
                </div>
              </section>
            </div>
          </section>
        )}

        {tab === 'notes' && (
          <section className="learning-section">
            <div className="learning-heading"><div><span className="learning-kicker">Staff observations</span><h2>Learning Notes</h2><p>Keep short academic observations separate from behavior notes and medical information.</p></div></div>
            <div className="learning-two-column">
              <section className="card">
                <h2>Add note</h2>
                <label className="field"><span>Student</span><select value={noteChildId ?? ''} onChange={(event) => setNoteChildId(Number(event.target.value))}>{children.map((child) => <option value={child.id} key={child.id}>{childName(child)}</option>)}</select></label>
                <label className="field"><span>Date</span><input type="date" value={noteDate} onChange={(event) => setNoteDate(event.target.value)} /></label>
                <label className="field"><span>Observation</span><textarea rows={5} value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Example: Needed less help finding the main idea today." /></label>
                <button className="primary" type="button" disabled={saving || !noteChildId || !noteText.trim()} onClick={() => void addNote()}>{saving ? 'Saving…' : 'Save learning note'}</button>
              </section>

              <section className="card">
                <div className="section-heading"><div><h2>Recent notes</h2><p className="subtle">Latest academic observations across active students.</p></div><span className="badge">{notes.length}</span></div>
                <div className="learning-log-list">
                  {notes.map((row) => {
                    const child = childById.get(row.child_id)
                    return <article key={row.id}><span className="learning-avatar small">{child?.first_name[0]?.toUpperCase() ?? '?'}</span><span><strong>{child ? childName(child) : 'Student'}</strong><small>{dateLabel(row.note_date)}</small><p>{row.note}</p></span></article>
                  })}
                  {notes.length === 0 && <div className="learning-inline-empty">No learning notes have been added yet.</div>}
                </div>
              </section>
            </div>
          </section>
        )}
      </main>

      {myWeekOpen && myWeekChild && (
        <StudentMyWeek
          studentName={childName(myWeekChild)}
          grade={registrationByChild.get(myWeekChild.id)?.grade ?? null}
          weekLabel={weekLabel(weekStart)}
          items={myWeekItems}
          onLaunch={launchMyWeekItem}
          onExit={() => setMyWeekOpen(false)}
        />
      )}

      <AssignmentCompletionDialog
        row={completionTarget?.row ?? null}
        assignmentTitle={completionTarget?.assignment.title ?? ''}
        studentName={completionTarget ? childName(completionTarget.child) : ''}
        userId={session.user.id}
        onClose={() => setCompletionTarget(null)}
        onSaved={loadData}
      />

      <AssignmentPreviewDialog
        assignment={previewAssignment}
        onClose={() => setPreviewAssignment(null)}
      />

      <AssignmentTestRunner
        assignment={testAssignment}
        onClose={() => setTestAssignment(null)}
      />

      {typingTarget && (
        <TypingActivityRunner
          studentAssignmentId={typingTarget.row.id}
          childId={typingTarget.child.id}
          assignmentId={typingTarget.assignment.id}
          assignmentTitle={typingTarget.assignment.title}
          studentName={childName(typingTarget.child)}
          activityConfig={typingTarget.assignment.activity_config}
          userId={session.user.id}
          onClose={() => setTypingTarget(null)}
          onSaved={loadData}
        />
      )}

      {quizTarget && (
        <QuizActivityRunner
          studentAssignmentId={quizTarget.row.id}
          childId={quizTarget.child.id}
          assignmentId={quizTarget.assignment.id}
          assignmentTitle={quizTarget.assignment.title}
          studentName={childName(quizTarget.child)}
          activityConfig={quizTarget.assignment.activity_config as QuizConfig}
          userId={session.user.id}
          onClose={() => setQuizTarget(null)}
          onSaved={loadData}
        />
      )}

      {writingTarget && (
        <WritingActivityRunner
          studentAssignmentId={writingTarget.row.id}
          studentAssignmentStatus={writingTarget.row.status}
          childId={writingTarget.child.id}
          assignmentId={writingTarget.assignment.id}
          assignmentTitle={writingTarget.assignment.title}
          studentName={childName(writingTarget.child)}
          activityConfig={writingTarget.assignment.activity_config as WritingConfig}
          userId={session.user.id}
          onClose={() => setWritingTarget(null)}
          onSaved={loadData}
        />
      )}

      <WritingReviewDialog
        submission={writingReviewTarget?.submission ?? null}
        assignmentTitle={writingReviewTarget?.assignment.title ?? ''}
        studentName={writingReviewTarget ? childName(writingReviewTarget.child) : ''}
        activityConfig={writingReviewTarget?.assignment.activity_config ?? null}
        userId={session.user.id}
        onClose={() => setWritingReviewTarget(null)}
        onSaved={loadData}
      />

      {readingTarget && (
        <ReadingActivityRunner
          studentAssignmentId={readingTarget.row.id}
          childId={readingTarget.child.id}
          assignmentId={readingTarget.assignment.id}
          assignmentTitle={readingTarget.assignment.title}
          studentName={childName(readingTarget.child)}
          activityConfig={readingTarget.assignment.activity_config as ReadingConfig}
          userId={session.user.id}
          onClose={() => setReadingTarget(null)}
          onSaved={loadData}
        />
      )}

      <ReadingReviewDialog
        attempt={readingReviewTarget?.attempt ?? null}
        assignmentTitle={readingReviewTarget?.assignment.title ?? ''}
        studentName={readingReviewTarget ? childName(readingReviewTarget.child) : ''}
        activityConfig={readingReviewTarget ? readingReviewTarget.assignment.activity_config as ReadingConfig : null}
        userId={session.user.id}
        onClose={() => setReadingReviewTarget(null)}
        onSaved={loadData}
      />
    </div>
  )
}
