'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { studentLearningRequest, type StudentAccessContext } from '@/lib/studentLearning'
import StudentMyWeek, { type MyWeekItem } from '@/components/StudentMyWeek'
import TypingActivityRunner from '@/components/TypingActivityRunner'
import QuizActivityRunner, { type QuizConfig } from '@/components/QuizActivityRunner'
import WritingActivityRunner, { type WritingConfig } from '@/components/WritingActivityRunner'
import ReadingActivityRunner, { type ReadingConfig } from '@/components/ReadingActivityRunner'

type LabStudent = {
  id: number
  first_name: string
  display_name: string
  grade: string | null
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
  const weekStart = mondayFor(localDate())
  const [deviceToken, setDeviceToken] = useState('')
  const [studentToken, setStudentToken] = useState('')
  const [student, setStudent] = useState<LabStudent | null>(null)
  const [students, setStudents] = useState<LabStudent[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null)
  const [pin, setPin] = useState('')
  const [week, setWeek] = useState<WeekResponse>({ rows: [], assignments: [], writing: [], reading: [] })
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [staffSessionAvailable, setStaffSessionAvailable] = useState(false)
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

    void supabase.auth.getSession().then(({ data }) => setStaffSessionAvailable(Boolean(data.session)))

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
      const data = await studentLearningRequest<{ device_token: string }>('provision_device', {
        label: 'Computer Lab • ' + new Date().toLocaleDateString(),
      })
      window.localStorage.setItem(DEVICE_KEY, data.device_token)
      setDeviceToken(data.device_token)
      await supabase.auth.signOut()
      setStaffSessionAvailable(false)
      await loadStudents(data.device_token)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'This computer could not be activated.')
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
    setWeek({ rows: [], assignments: [], writing: [], reading: [] })
    setMessage(inactive ? 'You were signed out after 30 minutes of inactivity.' : '')
    await loadStudents(deviceToken)
  }

  const assignmentById = useMemo(() => new Map(week.assignments.map((assignment) => [assignment.id, assignment])), [week.assignments])
  const writingByRow = useMemo(() => new Map(week.writing.map((item) => [item.student_assignment_id, item])), [week.writing])
  const readingByRow = useMemo(() => new Map(week.reading.map((item) => [item.student_assignment_id, item])), [week.reading])

  const items = useMemo<MyWeekItem[]>(() => week.rows.flatMap((row) => {
    const assignment = assignmentById.get(row.assignment_id)
    if (!assignment) return []
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
      writingStatus: writingByRow.get(row.id)?.status ?? null,
      readingReviewStatus: readingByRow.get(row.id)?.review_status ?? null,
    }]
  }), [week.rows, assignmentById, writingByRow, readingByRow])

  function launchItem(item: MyWeekItem) {
    const row = week.rows.find((entry) => entry.id === item.rowId)
    const assignment = assignmentById.get(item.assignmentId)
    if (row && assignment && ['typing', 'quiz', 'writing', 'reading'].includes(assignment.assignment_type)) {
      setActiveItem({ row, assignment })
    }
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
                  <small>{item.grade ? 'Grade ' + item.grade : 'Student'}</small>
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
    )
  }

  return (
    <>
      <StudentMyWeek
        studentName={student.display_name}
        grade={student.grade}
        weekLabel={weekLabel(weekStart)}
        items={items}
        onLaunch={launchItem}
        onExit={() => void signOutStudent(false)}
        exitLabel="Sign out"
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

      {activeItem?.assignment.assignment_type === 'quiz' && access && (
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
