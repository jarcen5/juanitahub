'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import AssignmentCompletionDialog from '@/components/AssignmentCompletionDialog'
import AssignmentPreviewDialog from '@/components/AssignmentPreviewDialog'
import TypingActivityRunner from '@/components/TypingActivityRunner'

type Profile = { display_name: string; role: 'staff' | 'admin'; active: boolean }
type Child = { id: number; first_name: string; last_name: string | null; active: boolean }
type Registration = { child_id: number; grade: string | null; school: string | null }
type TypingConfig = { passage?: string; target_wpm?: number; target_accuracy?: number }
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
  activity_config: TypingConfig
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
  created_at: string
}
type LearningTab = 'week' | 'library' | 'typing' | 'reading' | 'notes'
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

const starterAssignments: Omit<LearningAssignment, 'id' | 'active' | 'activity_config'>[] = [
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
  const [assignmentUsageRows, setAssignmentUsageRows] = useState<{ assignment_id: number; status: StudentAssignment['status'] }[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingAssignmentId, setEditingAssignmentId] = useState<number | null>(null)
  const [starterAdding, setStarterAdding] = useState(false)
  const [previewAssignment, setPreviewAssignment] = useState<LearningAssignment | null>(null)
  const [typingTarget, setTypingTarget] = useState<{ row: StudentAssignment; child: Child; assignment: LearningAssignment } | null>(null)

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
  const [typingPassage, setTypingPassage] = useState('')
  const [typingTargetWpm, setTypingTargetWpm] = useState('15')
  const [typingTargetAccuracy, setTypingTargetAccuracy] = useState('90')

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
      setTab(['week', 'library', 'typing', 'reading', 'notes'].includes(requested) ? requested : 'week')
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

    const [profileResult, childResult, registrationResult, libraryResult, weeklyResult, readingResult, notesResult, usageResult, typingResult] = await Promise.all([
      supabase.from('staff_profiles').select('display_name, role, active').eq('user_id', session.user.id).maybeSingle(),
      supabase.from('children').select('id, first_name, last_name, active').eq('active', true).order('first_name').order('last_name'),
      supabase.from('child_registrations').select('child_id, grade, school').eq('status', 'active'),
      supabase.from('learning_assignments').select('id, title, subject, assignment_type, skill, grade_levels, difficulty, delivery_format, instructions, estimated_minutes, resource_url, active, activity_config').order('subject').order('title'),
      supabase.from('learning_student_assignments').select('id, child_id, assignment_id, week_start, due_date, status, completed_at, score, max_score, minutes_spent, staff_note').eq('week_start', weekStart).order('child_id').order('id'),
      supabase.from('learning_reading_logs').select('id, child_id, read_on, title, minutes, pages, note, created_at').gte('read_on', weekStart).lte('read_on', weekEnd).order('read_on', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('learning_staff_notes').select('id, child_id, note_date, note, created_at').order('note_date', { ascending: false }).order('created_at', { ascending: false }).limit(120),
      supabase.from('learning_student_assignments').select('assignment_id, status'),
      supabase.from('learning_typing_attempts').select('id, student_assignment_id, child_id, assignment_id, wpm, accuracy, duration_seconds, created_at').order('created_at', { ascending: false }).limit(80),
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

    const nextChildren = (childResult.data ?? []) as Child[]
    setProfile(profileResult.data as Profile | null)
    setChildren(nextChildren)
    setRegistrations((registrationResult.data ?? []) as Registration[])
    setLibrary((libraryResult.data ?? []) as LearningAssignment[])
    setWeeklyAssignments((weeklyResult.data ?? []) as StudentAssignment[])
    setReadingLogs((readingResult.data ?? []) as ReadingLog[])
    setNotes((notesResult.data ?? []) as LearningNote[])
    setAssignmentUsageRows((usageResult.data ?? []) as { assignment_id: number; status: StudentAssignment['status'] }[])
    setTypingAttempts((typingResult.data ?? []) as TypingAttempt[])
    setAssignChildId((current) => current && nextChildren.some((child) => child.id === current) ? current : nextChildren[0]?.id ?? null)
    setReadingChildId((current) => current && nextChildren.some((child) => child.id === current) ? current : nextChildren[0]?.id ?? null)
    setNoteChildId((current) => current && nextChildren.some((child) => child.id === current) ? current : nextChildren[0]?.id ?? null)
    if (error) setMessage(error.message)
    setLoading(false)
  }

  const childById = useMemo(() => new Map(children.map((child) => [child.id, child])), [children])
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
      const current = map.get(row.assignment_id) ?? { assigned: 0, completed: 0 }
      current.assigned += 1
      if (row.status === 'completed') current.completed += 1
      map.set(row.assignment_id, current)
    }
    return map
  }, [assignmentUsageRows])

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

  const metrics = useMemo(() => ({
    assigned: weeklyAssignments.length,
    completed: weeklyAssignments.filter((row) => row.status === 'completed').length,
    readingMinutes: readingLogs.reduce((sum, row) => sum + Number(row.minutes), 0),
    children: new Set([...weeklyAssignments.map((row) => row.child_id), ...readingLogs.map((row) => row.child_id)]).size,
  }), [weeklyAssignments, readingLogs])

  const weeklyTypingAssignments = useMemo(() => weeklyAssignments.filter((row) => assignmentById.get(row.assignment_id)?.assignment_type === 'typing'), [weeklyAssignments, assignmentById])
  const weeklyTypingIds = useMemo(() => new Set(weeklyTypingAssignments.map((row) => row.id)), [weeklyTypingAssignments])
  const weeklyTypingAttempts = useMemo(() => typingAttempts.filter((attempt) => weeklyTypingIds.has(attempt.student_assignment_id)), [typingAttempts, weeklyTypingIds])
  const typingSummary = useMemo(() => {
    const attempts = weeklyTypingAttempts.length
    const averageWpm = attempts ? weeklyTypingAttempts.reduce((sum, attempt) => sum + Number(attempt.wpm), 0) / attempts : 0
    const averageAccuracy = attempts ? weeklyTypingAttempts.reduce((sum, attempt) => sum + Number(attempt.accuracy), 0) / attempts : 0
    return {
      assigned: weeklyTypingAssignments.length,
      completed: weeklyTypingAssignments.filter((row) => row.status === 'completed').length,
      attempts,
      averageWpm,
      averageAccuracy,
    }
  }, [weeklyTypingAssignments, weeklyTypingAttempts])

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
    setTypingPassage('')
    setTypingTargetWpm('15')
    setTypingTargetAccuracy('90')
  }

  function beginAddAssignment() {
    resetAssignmentEditor()
    setEditorOpen(true)
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
    setTypingPassage(typeof assignment.activity_config?.passage === 'string' ? assignment.activity_config.passage : '')
    setTypingTargetWpm(typeof assignment.activity_config?.target_wpm === 'number' ? String(assignment.activity_config.target_wpm) : '15')
    setTypingTargetAccuracy(typeof assignment.activity_config?.target_accuracy === 'number' ? String(assignment.activity_config.target_accuracy) : '90')
    setEditorOpen(true)
  }

  async function saveAssignment() {
    if (!session || profile?.role !== 'admin' || saving || !newTitle.trim()) return
    if (newType === 'typing' && !typingPassage.trim()) return showMessage('Add a typing passage before saving a typing activity.')
    const parsedTargetWpm = typingTargetWpm.trim() ? Number(typingTargetWpm) : null
    const parsedTargetAccuracy = typingTargetAccuracy.trim() ? Number(typingTargetAccuracy) : null
    if (newType === 'typing' && parsedTargetWpm != null && (!Number.isFinite(parsedTargetWpm) || parsedTargetWpm <= 0)) return showMessage('Typing WPM goal must be greater than 0.')
    if (newType === 'typing' && parsedTargetAccuracy != null && (!Number.isFinite(parsedTargetAccuracy) || parsedTargetAccuracy < 0 || parsedTargetAccuracy > 100)) return showMessage('Typing accuracy goal must be between 0 and 100.')
    const grades = [...new Set(newGrades.split(',').map((grade) => grade.trim()).filter(Boolean))]
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
      activity_config: newType === 'typing' ? {
        passage: typingPassage.trim(),
        ...(parsedTargetWpm == null ? {} : { target_wpm: parsedTargetWpm }),
        ...(parsedTargetAccuracy == null ? {} : { target_accuracy: parsedTargetAccuracy }),
      } : {},
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
      missing.map((assignment) => ({
        ...assignment,
        active: true,
        created_by: session.user.id,
        activity_config: assignment.assignment_type === 'typing' ? {
          passage: 'Learning new skills takes practice. Good typists focus on accuracy, keep their hands relaxed, and build speed one word at a time. Small improvements add up when you practice regularly.',
          target_wpm: 15,
          target_accuracy: 90,
        } : {},
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
                                {row.status === 'assigned' && <button className="ghost" type="button" disabled={saving} onClick={() => void updateStatus(row, 'in_progress')}>Start</button>}
                                {row.status !== 'completed' && <button className="primary" type="button" disabled={saving} onClick={() => setCompletionTarget({ row, child, assignment })}>Complete</button>}
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
                </div>
                <div className="learning-editor-actions">
                  <button className="ghost" type="button" disabled={saving} onClick={() => { resetAssignmentEditor(); setEditorOpen(false) }}>Cancel</button>
                  <button className="primary" type="button" disabled={saving || !newTitle.trim()} onClick={() => void saveAssignment()}>{saving ? 'Saving…' : editingAssignmentId ? 'Save changes' : 'Add to library'}</button>
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
                  {selectedAssignment.resource_url && <a className="learning-resource-link" href={selectedAssignment.resource_url} target="_blank" rel="noreferrer">Open resource ↗</a>}

                  <button className="learning-preview-button primary" type="button" onClick={() => setPreviewAssignment(selectedAssignment)}>👁 Preview assignment</button>

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

        {tab === 'reading' && (
          <section className="learning-section">
            <div className="learning-heading"><div><span className="learning-kicker">Reading practice</span><h2>Reading Log</h2><p>Track minutes and books without requiring a full assignment.</p></div></div>
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
    </div>
  )
}
