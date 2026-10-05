'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { studentLearningRequest, type StudentAccessContext } from '@/lib/studentLearning'
import { clearDeviceModeLock, setDeviceModeLock } from '@/lib/deviceMode'
import StudentMyWeek, { type MyWeekItem, type StudentGoalView, type StudentAchievementView } from '@/components/StudentMyWeek'
import TypingActivityRunner from '@/components/TypingActivityRunner'
import QuizActivityRunner, { type QuizConfig } from '@/components/QuizActivityRunner'
import WritingActivityRunner, { type WritingConfig } from '@/components/WritingActivityRunner'
import ReadingActivityRunner, { type ReadingConfig } from '@/components/ReadingActivityRunner'
import JuanitaQuestRunner, { type JuanitaQuestConfig } from '@/components/JuanitaQuestRunner'

type LabStudent = {
  id: number
  first_name: string
  display_name: string
  grade: string | null
  is_demo: boolean
}

type WeekRow = {
  id: number
  assignment_id: number
  week_start: string
  due_date: string | null
  status: 'assigned' | 'in_progress' | 'completed' | 'skipped'
  score: number | null
  max_score: number | null
  minutes_spent: number | null
  staff_note: string | null
}

type LabAssignment = {
  id: number
  title: string
  subject: 'reading' | 'writing' | 'grammar' | 'typing' | 'math' | 'general'
  assignment_type: 'activity' | 'reading' | 'writing' | 'quiz' | 'typing' | 'worksheet' | 'practice'
  skill: string | null
  estimated_minutes: number | null
  activity_config: Record<string, any>
  active: boolean
}

type HomeworkTask = {
  id: number
  child_id: number
  week_start: string
  due_date: string | null
  school_subject: string
  title: string
  details: string | null
  estimated_minutes: number | null
  status: 'assigned' | 'awaiting_review' | 'completed'
  student_marked_done_at: string | null
  staff_verified_at: string | null
}
type WritingState = {
  student_assignment_id: number
  status: 'draft' | 'submitted' | 'reviewed'
}

type ReadingState = {
  student_assignment_id: number
  review_status: 'not_needed' | 'pending' | 'reviewed'
}

type WeekResponse = {
  rows: WeekRow[]
  assignments: LabAssignment[]
  writing: WritingState[]
  reading: ReadingState[]
  homework: HomeworkTask[]
  goals: StudentGoalView[]
  achievements: StudentAchievementView[]
}

const DEVICE_KEY = 'juanita-learning-device'
const STUDENT_KEY = 'juanita-learning-student-session'
const STUDENT_PROFILE_KEY = 'juanita-learning-student-profile'
const INACTIVITY_MS = 30 * 60 * 1000

function localDate() {
  const now = new Date()
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
}

function mondayFor(value: string) {
  const date = new Date(value + 'T12:00:00')
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

function addDays(value: string, days: number) {
  const date = new Date(value + 'T12:00:00')
  date.setDate(date.getDate() + days)
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

function dateLabel(value: string) {
  return new Date(value + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function weekLabel(value: string) {
  return dateLabel(value) + ' – ' + dateLabel(addDays(value, 6))
}

export default function StudentLearningPage() {
  const router = useRouter()
  const weekStart = mondayFor(localDate())
  const [deviceToken, setDeviceToken] = useState('')
  const [studentToken, setStudentToken] = useState('')
  const [student, setStudent] = useState<LabStudent | null>(null)
  const [students, setStudents] = useState<LabStudent[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null)
  const [pin, setPin] = useState('')
  const [week, setWeek] = useState<WeekResponse>({ rows: [], assignments: [], writing: [], reading: [], homework: [], goals: [], achievements: [] })
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [staffSessionAvailable, setStaffSessionAvailable] = useState(false)
  const [staffExitOpen, setStaffExitOpen] = useState(false)
  const [staffEmail, setStaffEmail] = useState('')
  const [staffPassword, setStaffPassword] = useState('')
  const [staffExitError, setStaffExitError] = useState('')
  const [staffExitWorking, setStaffExitWorking] = useState(false)
  const [activeItem, setActiveItem] = useState<{ row: WeekRow; assignment: LabAssignment } | null>(null)

  useEffect(() => {
    const savedDevice = window.localStorage.getItem(DEVICE_KEY) ?? ''
    const savedStudentToken = window.sessionStorage.getItem(STUDENT_KEY) ?? ''
    const savedProfileRaw = window.sessionStorage.getItem(STUDENT_PROFILE_KEY)
    let savedProfile: LabStudent | null = null
    try { savedProfile = savedProfileRaw ? JSON.parse(savedProfileRaw) as LabStudent : null } catch {}
    setDeviceToken(savedDevice)
    setStudentToken(savedStudentToken)
    setStudent(savedProfile)

    if (savedDevice) setDeviceModeLock('learning')

    void supabase.auth.getSession().then(async ({ data }) => {
      if (savedDevice) {
        if (data.session) await supabase.auth.signOut({ scope: 'local' })
        setStaffSessionAvailable(false)
      } else {
        setStaffSessionAvailable(Boolean(data.session))
      }
    })

    if (savedDevice && savedStudentToken && savedProfile) {
      void loadWeek(savedDevice, savedStudentToken)
    } else if (savedDevice) {
      void loadStudents(savedDevice)
    } else {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!studentToken || !deviceToken) return
    let timeout: number
    const reset = () => {
      window.clearTimeout(timeout)
      timeout = window.setTimeout(() => void signOutStudent(true), INACTIVITY_MS)
    }
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart']
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }))
    reset()
    return () => {
      window.clearTimeout(timeout)
      events.forEach((event) => window.removeEventListener(event, reset))
    }
  }, [studentToken, deviceToken])

  async function loadStudents(token = deviceToken) {
    if (!token) return
    setLoading(true)
    setMessage('')
    try {
      const data = await studentLearningRequest<{ students: LabStudent[] }>('list_students', { device_token: token })
      setStudents(data.students)
      setSelectedStudentId((current) => current && data.students.some((item) => item.id === current) ? current : null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'This computer is not ready for Student Learning.')
      if ((error instanceof Error ? error.message : '').toLowerCase().includes('not activated')) {
        window.localStorage.removeItem(DEVICE_KEY)
        clearDeviceModeLock()
        setDeviceToken('')
      }
    }
    setLoading(false)
  }

  async function loadWeek(device = deviceToken, token = studentToken) {
    if (!device || !token) return
    setLoading(true)
    setMessage('')
    try {
      const data = await studentLearningRequest<WeekResponse>('load_week', {
        device_token: device,
        student_token: token,
        week_start: weekStart,
      })
      setWeek({
        rows: data.rows ?? [],
        assignments: data.assignments ?? [],
        writing: data.writing ?? [],
        reading: data.reading ?? [],
        homework: data.homework ?? [],
        goals: data.goals ?? [],
        achievements: data.achievements ?? [],
      })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Your Student Learning session ended.')
      window.sessionStorage.removeItem(STUDENT_KEY)
      window.sessionStorage.removeItem(STUDENT_PROFILE_KEY)
      setStudentToken('')
      setStudent(null)
      setActiveItem(null)
      await loadStudents(device)
    }
    setLoading(false)
  }

  async function activateComputer() {
    if (working) return
    setWorking(true)
    setMessage('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData.session
      if (!session?.user) throw new Error('Please sign in as an admin, then return to Student Learning.')

      const { data: deviceId, error } = await supabase.rpc('activate_learning_lab_device_v2', {
        p_label: 'Computer Lab • ' + new Date().toLocaleDateString(),
      })
      if (error || !deviceId) throw error ?? new Error('This computer could not be activated.')

      const deviceToken = String(deviceId)
      window.localStorage.setItem(DEVICE_KEY, deviceToken)
      setDeviceModeLock('learning')
      setDeviceToken(deviceToken)
      await loadStudents(deviceToken)
      await supabase.auth.signOut({ scope: 'local' })
      setStaffSessionAvailable(false)
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'This computer could not be activated.'
      setMessage('Activation failed: ' + detail)
    }
    setWorking(false)
  }

  async function signInStudent() {
    if (!deviceToken || !selectedStudentId || pin.length !== 4 || working) return
    setWorking(true)
    setMessage('')
    try {
      const data = await studentLearningRequest<{ student_token: string; student: LabStudent }>('student_login', {
        device_token: deviceToken,
        child_id: selectedStudentId,
        pin,
      })
      window.sessionStorage.setItem(STUDENT_KEY, data.student_token)
      window.sessionStorage.setItem(STUDENT_PROFILE_KEY, JSON.stringify(data.student))
      setStudentToken(data.student_token)
      setStudent(data.student)
      setPin('')
      await loadWeek(deviceToken, data.student_token)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Student sign-in failed.')
      setPin('')
    }
    setWorking(false)
  }

  async function signOutStudent(inactive = false) {
    if (deviceToken && studentToken) {
      try {
        await studentLearningRequest('student_logout', {
          device_token: deviceToken,
          student_token: studentToken,
        })
      } catch {}
    }
    window.sessionStorage.removeItem(STUDENT_KEY)
    window.sessionStorage.removeItem(STUDENT_PROFILE_KEY)
    setStudentToken('')
    setStudent(null)
    setActiveItem(null)
    setWeek({ rows: [], assignments: [], writing: [], reading: [], homework: [], goals: [], achievements: [] })
    setMessage(inactive ? 'You were signed out after 30 minutes of inactivity.' : '')
    await loadStudents(deviceToken)
  }


  async function unlockStaffExit() {
    const email = staffEmail.trim()
    if (!email || !staffPassword || staffExitWorking) return

    setStaffExitWorking(true)
    setStaffExitError('')

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: staffPassword,
    })

    if (error || !data.user) {
      setStaffExitError('That staff email or password did not match.')
      setStaffPassword('')
      setStaffExitWorking(false)
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('staff_profiles')
      .select('active')
      .eq('user_id', data.user.id)
      .maybeSingle()

    if (profileError || !profile?.active) {
      await supabase.auth.signOut({ scope: 'local' })
      setStaffExitError('That account is not an active Juanita Hub staff account.')
      setStaffPassword('')
      setStaffExitWorking(false)
      return
    }

    if (deviceToken && studentToken) {
      try {
        await studentLearningRequest('student_logout', {
          device_token: deviceToken,
          student_token: studentToken,
        })
      } catch {}
    }

    window.sessionStorage.removeItem(STUDENT_KEY)
    window.sessionStorage.removeItem(STUDENT_PROFILE_KEY)
    clearDeviceModeLock()
    setStaffExitOpen(false)
    setStaffExitWorking(false)
    router.replace('/')
    router.refresh()
  }

  const staffExitControls = deviceToken ? (
    <>
      <button
        className="lab-staff-exit-trigger"
        type="button"
        onClick={() => {
          setStaffExitError('')
          setStaffPassword('')
          setStaffExitOpen(true)
        }}
        aria-label="Staff exit from Student Learning"
      >
        <span aria-hidden="true">🔒</span>
        <span>Staff</span>
      </button>

      {staffExitOpen && (
        <div className="kiosk-staff-unlock-backdrop" role="dialog" aria-modal="true" aria-labelledby="lab-staff-exit-title">
          <section className="kiosk-staff-unlock-card">
            <button type="button" className="kiosk-close" onClick={() => !staffExitWorking && setStaffExitOpen(false)} aria-label="Close staff exit">×</button>
            <span className="kiosk-lock-icon">🔒</span>
            <h2 id="lab-staff-exit-title">Staff exit</h2>
            <p>Sign in with an active Juanita Hub staff account to leave Student Learning.</p>
            <input
              type="email"
              value={staffEmail}
              onChange={(event) => setStaffEmail(event.target.value)}
              placeholder="Staff email"
              autoComplete="email"
              disabled={staffExitWorking}
            />
            <input
              type="password"
              value={staffPassword}
              onChange={(event) => setStaffPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void unlockStaffExit()
              }}
              placeholder="Staff password"
              autoComplete="current-password"
              disabled={staffExitWorking}
            />
            {staffExitError && <div className="kiosk-unlock-error">{staffExitError}</div>}
            <button
              type="button"
              className="kiosk-unlock-submit"
              onClick={() => void unlockStaffExit()}
              disabled={!staffEmail.trim() || !staffPassword || staffExitWorking}
            >
              {staffExitWorking ? 'Verifying…' : 'Exit to staff dashboard'}
            </button>
            <small>Student Learning stays locked even if someone changes the browser URL.</small>
          </section>
        </div>
      )}
    </>
  ) : null

  const assignmentById = useMemo(() => new Map(week.assignments.map((assignment) => [assignment.id, assignment])), [week.assignments])
  const writingByRow = useMemo(() => new Map(week.writing.map((item) => [item.student_assignment_id, item])), [week.writing])
  const readingByRow = useMemo(() => new Map(week.reading.map((item) => [item.student_assignment_id, item])), [week.reading])

  const items = useMemo<MyWeekItem[]>(() => {
    const assignmentItems = week.rows.flatMap((row) => {
      const assignment = assignmentById.get(row.assignment_id)
      if (!assignment) return []
      return [{
        kind: 'assignment' as const,
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
        writingStatus: writingByRow.get(row.id)?.status ?? null,
        readingReviewStatus: readingByRow.get(row.id)?.review_status ?? null,
        isJuanitaQuest: assignment.assignment_type === 'quiz' && assignment.activity_config?.experience === 'juanita_quest',
      }]
    })
    const homeworkItems: MyWeekItem[] = week.homework.map((task) => ({
      kind: 'homework',
      rowId: task.id,
      assignmentId: null,
      homeworkId: task.id,
      title: task.title,
      subject: 'general',
      assignmentType: 'activity',
      skill: task.details || 'School homework',
      status: task.status === 'awaiting_review' ? 'in_progress' : task.status,
      dueDate: task.due_date,
      estimatedMinutes: task.estimated_minutes,
      score: null,
      maxScore: null,
      homeworkStatus: task.status,
      schoolSubject: task.school_subject,
      details: task.details,
    }))
    return [...assignmentItems, ...homeworkItems]
  }, [week.rows, week.homework, assignmentById, writingByRow, readingByRow])

  function launchItem(item: MyWeekItem) {
    const row = week.rows.find((entry) => entry.id === item.rowId)
    const assignment = item.assignmentId == null ? null : assignmentById.get(item.assignmentId)
    if (row && assignment && ['typing', 'quiz', 'writing', 'reading'].includes(assignment.assignment_type)) {
      setActiveItem({ row, assignment })
    }
  }

  async function markHomeworkDone(item: MyWeekItem) {
    if (!deviceToken || !studentToken || !item.homeworkId || working || item.homeworkStatus !== 'assigned') return
    setWorking(true)
    setMessage('')
    try {
      await studentLearningRequest('mark_homework_done', {
        device_token: deviceToken,
        student_token: studentToken,
        homework_id: item.homeworkId,
      })
      await loadWeek()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Homework could not be marked finished.')
    }
    setWorking(false)
  }

  const selectedStudent = students.find((item) => item.id === selectedStudentId) ?? null
  const access: StudentAccessContext | null = deviceToken && studentToken ? { deviceToken, studentToken } : null

  if (!deviceToken) {
    return (
      <main className="lab-setup-page">
        <section className="lab-setup-card">
          <span className="lab-logo">JH</span>
          <span className="learning-kicker">Computer Lab Mode</span>
          <h1>Set up Student Learning</h1>
          <p>This computer needs to be activated once by a signed-in Juanita Hub staff member. After activation, the staff session is signed out and students can only access Student Learning.</p>
          {message && <div className="notice">{message}</div>}
          {staffSessionAvailable
            ? <button className="primary" type="button" disabled={working} onClick={() => void activateComputer()}>{working ? 'Activating…' : 'Activate this computer'}</button>
            : <><a className="primary lab-signin-link" href="/">Staff sign in to Juanita Hub</a><small>After signing in, return to <strong>/learn</strong> to activate this computer.</small></>}
        </section>
      </main>
    )
  }

  if (!student || !studentToken) {
    return (
      <>
      <main className="lab-login-page">
        <header className="lab-login-header">
          <span className="lab-logo">JH</span>
          <div><strong>Juanita Hub Learning</strong><small>Computer Lab</small></div>
        </header>

        <section className="lab-login-shell">
          <div className="lab-login-intro">
            <span className="learning-kicker">Welcome!</span>
            <h1>Who’s learning today?</h1>
            <p>Choose your name, then enter your birthday PIN using the month and day.</p>
          </div>

          {message && <div className="notice lab-message">{message}</div>}

          {loading ? <div className="lab-loading">Loading students…</div> : (
            <div className="lab-student-grid">
              {students.map((item) => (
                <button className={selectedStudentId === item.id ? 'selected' : ''} type="button" key={item.id} onClick={() => { setSelectedStudentId(item.id); setPin(''); setMessage('') }}>
                  <span>{item.first_name[0]?.toUpperCase()}</span>
                  <strong>{item.display_name}</strong>
                  <small>{item.is_demo ? 'Demo/Test • ' : ''}{item.grade ? 'Grade ' + item.grade : 'Student'}</small>
                </button>
              ))}
              {students.length === 0 && <div className="lab-empty">No students are ready for Learning access yet. Ask a staff member to check birthdays and Learning Access in Student Directory.</div>}
            </div>
          )}

          {selectedStudent && (
            <section className="lab-pin-card">
              <button className="lab-back-choice" type="button" onClick={() => { setSelectedStudentId(null); setPin(''); setMessage('') }}>← Choose a different name</button>
              <span className="lab-pin-avatar">{selectedStudent.first_name[0]?.toUpperCase()}</span>
              <h2>Hi, {selectedStudent.first_name}!</h2>
              <p>Enter your birthday as <strong>MMDD</strong>.<br />Example: March 8 = <strong>0308</strong>.</p>
              <input
                className="lab-pin-input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
                onKeyDown={(event) => { if (event.key === 'Enter' && pin.length === 4) void signInStudent() }}
                aria-label="Birthday PIN"
                placeholder="••••"
                autoFocus
              />
              <button className="primary lab-pin-button" type="button" disabled={working || pin.length !== 4} onClick={() => void signInStudent()}>{working ? 'Signing in…' : 'Open My Week'}</button>
            </section>
          )}
        </section>
      </main>
      {staffExitControls}
      </>
    )
  }

  return (
    <>
      {staffExitControls}
      <StudentMyWeek
        studentName={student.display_name}
        grade={student.grade}
        weekLabel={weekLabel(weekStart)}
        items={items}
        onLaunch={launchItem}
        onHomeworkDone={(item) => void markHomeworkDone(item)}
        onExit={() => void signOutStudent(false)}
        exitLabel="Sign out"
        isDemo={student.is_demo}
        goals={week.goals}
        achievements={week.achievements}
      />

      {activeItem?.assignment.assignment_type === 'typing' && access && (
        <TypingActivityRunner
          studentAssignmentId={activeItem.row.id}
          childId={student.id}
          assignmentId={activeItem.assignment.id}
          assignmentTitle={activeItem.assignment.title}
          studentName={student.display_name}
          activityConfig={activeItem.assignment.activity_config}
          studentAccess={access}
          onClose={() => setActiveItem(null)}
          onSaved={() => loadWeek()}
        />
      )}

      {activeItem?.assignment.assignment_type === 'quiz' && activeItem.assignment.activity_config?.experience !== 'juanita_quest' && access && (
        <QuizActivityRunner
          studentAssignmentId={activeItem.row.id}
          childId={student.id}
          assignmentId={activeItem.assignment.id}
          assignmentTitle={activeItem.assignment.title}
          studentName={student.display_name}
          activityConfig={activeItem.assignment.activity_config as QuizConfig}
          studentAccess={access}
          onClose={() => setActiveItem(null)}
          onSaved={() => loadWeek()}
        />
      )}

      {activeItem?.assignment.assignment_type === 'quiz' && activeItem.assignment.activity_config?.experience === 'juanita_quest' && access && (
        <JuanitaQuestRunner
          studentAssignmentId={activeItem.row.id}
          childId={student.id}
          assignmentId={activeItem.assignment.id}
          assignmentTitle={activeItem.assignment.title}
          studentName={student.display_name}
          activityConfig={activeItem.assignment.activity_config as JuanitaQuestConfig}
          studentAccess={access}
          onClose={() => setActiveItem(null)}
          onSaved={() => loadWeek()}
        />
      )}

      {activeItem?.assignment.assignment_type === 'writing' && access && (
        <WritingActivityRunner
          studentAssignmentId={activeItem.row.id}
          studentAssignmentStatus={activeItem.row.status}
          childId={student.id}
          assignmentId={activeItem.assignment.id}
          assignmentTitle={activeItem.assignment.title}
          studentName={student.display_name}
          activityConfig={activeItem.assignment.activity_config as WritingConfig}
          studentAccess={access}
          onClose={() => setActiveItem(null)}
          onSaved={() => loadWeek()}
        />
      )}

      {activeItem?.assignment.assignment_type === 'reading' && access && (
        <ReadingActivityRunner
          studentAssignmentId={activeItem.row.id}
          childId={student.id}
          assignmentId={activeItem.assignment.id}
          assignmentTitle={activeItem.assignment.title}
          studentName={student.display_name}
          activityConfig={activeItem.assignment.activity_config as ReadingConfig}
          studentAccess={access}
          onClose={() => setActiveItem(null)}
          onSaved={() => loadWeek()}
        />
      )}
    </>
  )
}
