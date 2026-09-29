'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Profile = { display_name: string; role: 'staff' | 'admin'; active: boolean }
type Child = { id: number; first_name: string; last_name: string | null; active: boolean; is_demo: boolean }
type Registration = { child_id: number; school_year: string; school: string | null; grade: string | null }
type Assignment = {
  id: number
  title: string
  subject: 'reading' | 'writing' | 'grammar' | 'typing' | 'math' | 'general'
  assignment_type: string
  skill: string | null
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
type TypingAttempt = { id: number; assignment_id: number; wpm: number; accuracy: number; duration_seconds: number; created_at: string }
type QuizAttempt = { id: number; assignment_id: number; correct_count: number; question_count: number; percent: number; created_at: string }
type WritingSubmission = { id: number; assignment_id: number; word_count: number; status: 'draft'|'submitted'|'reviewed'; staff_feedback: string | null; submitted_at: string | null; reviewed_at: string | null; updated_at: string }
type ReadingAttempt = { id: number; assignment_id: number; objective_correct: number; objective_count: number; written_count: number; review_scores: Record<string, number>; review_status: 'not_needed'|'pending'|'reviewed'; staff_feedback: string | null; submitted_at: string; reviewed_at: string | null; created_at: string }
type ReadingLog = { id: number; read_on: string; title: string | null; minutes: number; pages: string | null }
type LearningNote = { id: number; note_date: string; note: string }
type PeriodPreset = '30' | '90' | 'month' | 'school' | 'custom'

const subjectLabels: Record<Assignment['subject'], string> = {
  reading: 'Reading', writing: 'Writing', grammar: 'Grammar', typing: 'Typing', math: 'Math', general: 'General',
}
const subjectIcons: Record<Assignment['subject'], string> = {
  reading: '📖', writing: '✍️', grammar: '🔤', typing: '⌨️', math: '➗', general: '📘',
}

function localDate() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10)
}
function shiftDays(value: string, days: number) {
  const [y,m,d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-')
}
function periodFor(preset: PeriodPreset) {
  const end = localDate()
  const now = new Date(end + 'T12:00:00')
  if (preset === '30') return { start: shiftDays(end, -29), end }
  if (preset === '90') return { start: shiftDays(end, -89), end }
  if (preset === 'month') return { start: end.slice(0,7) + '-01', end }
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
  return { start: year + '-07-01', end }
}
function fullName(child: Child) { return child.first_name + (child.last_name ? ' ' + child.last_name : '') }
function dateLabel(value: string) { return new Date(value.slice(0,10) + 'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) }
function average(values: number[]) { return values.length ? values.reduce((sum,value)=>sum+value,0)/values.length : null }
function pct(value: number | null) { return value == null ? '—' : Math.round(value) + '%' }

export default function StudentProgressReportsPage() {
  const initial = periodFor('90')
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [children, setChildren] = useState<Child[]>([])
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [childId, setChildId] = useState<number | null>(null)
  const [preset, setPreset] = useState<PeriodPreset>('90')
  const [start, setStart] = useState(initial.start)
  const [end, setEnd] = useState(initial.end)
  const [studentAssignments, setStudentAssignments] = useState<StudentAssignment[]>([])
  const [typing, setTyping] = useState<TypingAttempt[]>([])
  const [quizzes, setQuizzes] = useState<QuizAttempt[]>([])
  const [writing, setWriting] = useState<WritingSubmission[]>([])
  const [readingAttempts, setReadingAttempts] = useState<ReadingAttempt[]>([])
  const [readingLogs, setReadingLogs] = useState<ReadingLog[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [reportComment, setReportComment] = useState('')
  const [commentSaved, setCommentSaved] = useState('')
  const [loading, setLoading] = useState(true)
  const [reportLoading, setReportLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event,next) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    void loadSetup()
  }, [session])

  useEffect(() => {
    if (!session || !childId || !start || !end) return
    void loadReport()
  }, [session, childId, start, end])

  async function loadSetup() {
    if (!session) return
    setLoading(true)
    const [profileResult, childResult, registrationResult, assignmentResult] = await Promise.all([
      supabase.from('staff_profiles').select('display_name,role,active').eq('user_id',session.user.id).maybeSingle(),
      supabase.from('children').select('id,first_name,last_name,active,is_demo').eq('active',true).order('first_name').order('last_name'),
      supabase.from('child_registrations').select('child_id,school_year,school,grade').eq('status','active'),
      supabase.from('learning_assignments').select('id,title,subject,assignment_type,skill'),
    ])
    const error = profileResult.error ?? childResult.error ?? registrationResult.error ?? assignmentResult.error
    if (error) setMessage(error.message)
    const nextChildren = (childResult.data ?? []) as Child[]
    setProfile(profileResult.data as Profile | null)
    setChildren(nextChildren)
    setRegistrations((registrationResult.data ?? []) as Registration[])
    setAssignments((assignmentResult.data ?? []) as Assignment[])

    let requested: number | null = null
    if (typeof window !== 'undefined') {
      const raw = new URLSearchParams(window.location.search).get('child')
      const parsed = raw ? Number(raw) : NaN
      if (Number.isFinite(parsed) && nextChildren.some((child) => child.id === parsed)) requested = parsed
    }
    setChildId((current) => requested ?? (current && nextChildren.some((child)=>child.id===current) ? current : nextChildren[0]?.id ?? null))
    setLoading(false)
  }

  async function loadReport() {
    if (!childId) return
    setReportLoading(true)
    setMessage('')
    const startIso = start + 'T00:00:00'
    const endIso = end + 'T23:59:59.999'

    const [assignmentRows, typingRows, quizRows, writingRows, readingRows, logRows, noteRows, commentRow] = await Promise.all([
      supabase.from('learning_student_assignments')
        .select('id,assignment_id,week_start,due_date,status,completed_at,score,max_score,minutes_spent,staff_note')
        .eq('child_id',childId).gte('week_start',start).lte('week_start',end).order('week_start',{ascending:false}),
      supabase.from('learning_typing_attempts')
        .select('id,assignment_id,wpm,accuracy,duration_seconds,created_at')
        .eq('child_id',childId).gte('created_at',startIso).lte('created_at',endIso).order('created_at',{ascending:false}),
      supabase.from('learning_quiz_attempts')
        .select('id,assignment_id,correct_count,question_count,percent,created_at')
        .eq('child_id',childId).gte('created_at',startIso).lte('created_at',endIso).order('created_at',{ascending:false}),
      supabase.from('learning_writing_submissions')
        .select('id,assignment_id,word_count,status,staff_feedback,submitted_at,reviewed_at,updated_at')
        .eq('child_id',childId).gte('updated_at',startIso).lte('updated_at',endIso).order('updated_at',{ascending:false}),
      supabase.from('learning_reading_attempts')
        .select('id,assignment_id,objective_correct,objective_count,written_count,review_scores,review_status,staff_feedback,submitted_at,reviewed_at,created_at')
        .eq('child_id',childId).gte('created_at',startIso).lte('created_at',endIso).order('created_at',{ascending:false}),
      supabase.from('learning_reading_logs')
        .select('id,read_on,title,minutes,pages').eq('child_id',childId).gte('read_on',start).lte('read_on',end).order('read_on',{ascending:false}),
      supabase.from('learning_staff_notes')
        .select('id,note_date,note').eq('child_id',childId).gte('note_date',start).lte('note_date',end).order('note_date',{ascending:false}),
      supabase.from('learning_progress_report_comments')
        .select('summary,updated_at').eq('child_id',childId).eq('period_start',start).eq('period_end',end).maybeSingle(),
    ])

    const error = assignmentRows.error ?? typingRows.error ?? quizRows.error ?? writingRows.error ?? readingRows.error ?? logRows.error ?? noteRows.error ?? commentRow.error
    if (error) setMessage(error.message)
    setStudentAssignments((assignmentRows.data ?? []) as StudentAssignment[])
    setTyping((typingRows.data ?? []) as TypingAttempt[])
    setQuizzes((quizRows.data ?? []) as QuizAttempt[])
    setWriting((writingRows.data ?? []) as WritingSubmission[])
    setReadingAttempts((readingRows.data ?? []) as ReadingAttempt[])
    setReadingLogs((logRows.data ?? []) as ReadingLog[])
    setNotes((noteRows.data ?? []) as LearningNote[])
    setReportComment(String(commentRow.data?.summary ?? ''))
    setCommentSaved(commentRow.data?.updated_at ? 'Saved ' + new Date(commentRow.data.updated_at).toLocaleString() : '')
    setReportLoading(false)
  }

  function changePreset(next: PeriodPreset) {
    setPreset(next)
    if (next === 'custom') return
    const period = periodFor(next)
    setStart(period.start)
    setEnd(period.end)
  }

  async function saveComment() {
    if (!session || !childId || saving) return
    setSaving(true)
    setCommentSaved('')
    const { error } = await supabase.from('learning_progress_report_comments').upsert({
      child_id: childId,
      period_start: start,
      period_end: end,
      summary: reportComment.trim(),
      updated_by: session.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'child_id,period_start,period_end' })
    setSaving(false)
    if (error) { setMessage(error.message); return }
    setCommentSaved('Saved just now')
  }

  const child = useMemo(() => children.find((item)=>item.id===childId) ?? null,[children,childId])
  const registration = useMemo(() => registrations.find((item)=>item.child_id===childId) ?? null,[registrations,childId])
  const assignmentById = useMemo(() => new Map(assignments.map((item)=>[item.id,item])),[assignments])

  const metrics = useMemo(() => {
    const counted = studentAssignments.filter((row)=>row.status !== 'skipped')
    const completed = counted.filter((row)=>row.status === 'completed').length
    const quizAverage = average(quizzes.map((row)=>Number(row.percent)))
    const typingAccuracy = average(typing.map((row)=>Number(row.accuracy)))
    const typingWpm = average(typing.filter((row)=>Number(row.wpm)>0).map((row)=>Number(row.wpm)))
    const readingMinutes = readingLogs.reduce((sum,row)=>sum+Number(row.minutes),0)
    const reviewedWriting = writing.filter((row)=>row.status==='reviewed').length
    return {
      assigned: counted.length,
      completed,
      completion: counted.length ? (completed / counted.length) * 100 : null,
      quizAverage,
      typingAccuracy,
      typingWpm,
      readingMinutes,
      writingCount: writing.length,
      reviewedWriting,
    }
  },[studentAssignments,quizzes,typing,readingLogs,writing])

  const subjectRows = useMemo(() => {
    return (Object.keys(subjectLabels) as Assignment['subject'][]).map((subject)=>{
      const rows = studentAssignments.filter((row)=>assignmentById.get(row.assignment_id)?.subject===subject && row.status!=='skipped')
      const completed = rows.filter((row)=>row.status==='completed').length
      return { subject, assigned: rows.length, completed, completion: rows.length ? Math.round(completed/rows.length*100) : null }
    }).filter((row)=>row.assigned>0)
  },[studentAssignments,assignmentById])

  const readingScoreAverage = useMemo(() => {
    const scored = readingAttempts.flatMap((attempt)=>{
      const written = attempt.review_status==='reviewed'
        ? Object.values(attempt.review_scores ?? {}).reduce((sum,value)=>sum+Number(value),0)
        : 0
      const max = Number(attempt.objective_count)+Number(attempt.written_count)
      if (!max || (attempt.written_count>0 && attempt.review_status==='pending')) return []
      return [(Number(attempt.objective_correct)+written)/max*100]
    })
    return average(scored)
  },[readingAttempts])

  const latestTyping = [...typing].reverse()
  const typingStart = latestTyping[0]
  const typingEnd = latestTyping[latestTyping.length-1]

  if (loading && !session) return <main className="login-wrap"><div className="card login-card">Loading progress reports…</div></main>
  if (!session) return <main className="login-wrap"><section className="card login-card"><h1>Student Progress</h1><p className="subtle">Sign in through Juanita Hub to view reports.</p></section></main>
  if (!profile?.active) return <main className="login-wrap"><section className="card login-card"><h1>Student Progress</h1><div className="notice">Your staff account must be active to view progress reports.</div></section></main>

  return (
    <div className="shell">
      <header className="topbar"><div className="brand">Juanita Hub<small>Student Progress Reports</small></div><div className="toolbar"><span>{profile.display_name} <span className="badge">{profile.role}</span></span></div></header>

      <main className="main reports-page progress-report-page">
        <section className="hero reports-hero progress-report-hero no-print">
          <div><span className="reports-eyebrow">Learning reports</span><h1>Student Progress</h1><p className="subtle">Turn saved assignments, practice, reading, writing, and staff feedback into one clear student learning picture.</p></div>
          <button className="primary" type="button" disabled={!child || reportLoading} onClick={()=>window.print()}>Print / Save PDF</button>
        </section>

        <section className="card progress-report-controls no-print">
          <label className="field"><span>Student</span><select value={childId ?? ''} onChange={(e)=>setChildId(Number(e.target.value))}>{children.map((item)=><option value={item.id} key={item.id}>{fullName(item)}{item.is_demo ? ' • Demo/Test' : ''}</option>)}</select></label>
          <label className="field"><span>Period</span><select value={preset} onChange={(e)=>changePreset(e.target.value as PeriodPreset)}><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="month">This month</option><option value="school">School year to date</option><option value="custom">Custom range</option></select></label>
          <label className="field"><span>Start</span><input type="date" value={start} onChange={(e)=>{setPreset('custom');setStart(e.target.value)}} /></label>
          <label className="field"><span>End</span><input type="date" value={end} max={localDate()} onChange={(e)=>{setPreset('custom');setEnd(e.target.value)}} /></label>
        </section>

        {message && <div className="notice no-print">{message}</div>}
        {reportLoading && <div className="notice no-print">Refreshing progress report…</div>}

        {child && (
          <article className="progress-print-sheet">
            <header className="card progress-report-header">
              <div className="progress-student-identity"><span className="progress-avatar">{child.first_name[0]?.toUpperCase()}</span><div><span className="reports-eyebrow">Student progress report</span><h2>{fullName(child)} {child.is_demo && <span className="children-demo-badge">Demo/Test</span>}</h2><p>{[registration?.grade ? 'Grade '+registration.grade : '', registration?.school ?? '', registration?.school_year ?? ''].filter(Boolean).join(' • ') || 'Student learning record'}</p></div></div>
              <div className="progress-period"><small>Reporting period</small><strong>{dateLabel(start)}</strong><span>through {dateLabel(end)}</span></div>
            </header>

            <section className="reports-metric-grid progress-metric-grid">
              <article className="card reports-metric"><span>Assignment completion</span><strong>{pct(metrics.completion)}</strong><small>{metrics.completed}/{metrics.assigned} completed</small></article>
              <article className="card reports-metric"><span>Quiz average</span><strong>{pct(metrics.quizAverage)}</strong><small>{quizzes.length} attempt{quizzes.length===1?'':'s'}</small></article>
              <article className="card reports-metric"><span>Reading</span><strong>{metrics.readingMinutes}</strong><small>logged minutes</small></article>
              <article className="card reports-metric"><span>Typing accuracy</span><strong>{pct(metrics.typingAccuracy)}</strong><small>{typing.length} attempt{typing.length===1?'':'s'}</small></article>
              <article className="card reports-metric"><span>Writing</span><strong>{metrics.writingCount}</strong><small>{metrics.reviewedWriting} reviewed</small></article>
            </section>

            <section className="card progress-family-summary">
              <div className="reports-section-heading"><div><span className="reports-eyebrow">Report comment</span><h2>Progress summary</h2><p className="subtle">This comment is designed to appear in the printable report. Private staff Learning Notes are kept separate below.</p></div></div>
              <textarea className="no-print" rows={5} value={reportComment} onChange={(e)=>setReportComment(e.target.value)} placeholder="Example: Jordan has been completing writing assignments independently and is showing stronger organization in recent responses…" />
              <div className="progress-summary-print">{reportComment.trim() || 'No report comment has been added for this period.'}</div>
              <div className="progress-comment-actions no-print"><span>{commentSaved}</span><button className="primary" type="button" disabled={saving} onClick={()=>void saveComment()}>{saving?'Saving…':'Save report comment'}</button></div>
            </section>

            <section className="progress-report-grid">
              <section className="card progress-report-card">
                <div className="reports-section-heading"><div><span className="reports-eyebrow">Overview</span><h2>Subject completion</h2></div></div>
                <div className="progress-subject-list">
                  {subjectRows.map((row)=><article key={row.subject}><span className="progress-subject-icon">{subjectIcons[row.subject]}</span><span><strong>{subjectLabels[row.subject]}</strong><small>{row.completed}/{row.assigned} completed</small><span className="progress-track"><i style={{width:(row.completion ?? 0)+'%'}} /></span></span><em>{row.completion == null?'—':row.completion+'%'}</em></article>)}
                  {subjectRows.length===0 && <div className="reports-empty">No assignments in this period.</div>}
                </div>
              </section>

              <section className="card progress-report-card">
                <div className="reports-section-heading"><div><span className="reports-eyebrow">Typing</span><h2>Keyboard fluency</h2></div></div>
                <div className="progress-skill-facts"><div><small>Average WPM</small><strong>{metrics.typingWpm==null?'—':metrics.typingWpm.toFixed(1)}</strong></div><div><small>Average accuracy</small><strong>{pct(metrics.typingAccuracy)}</strong></div><div><small>Attempts</small><strong>{typing.length}</strong></div></div>
                {typingStart && typingEnd && typing.length>1 && <p className="progress-trend-note">First attempt: {Number(typingStart.wpm).toFixed(1)} WPM / {Number(typingStart.accuracy).toFixed(1)}% accuracy → latest: {Number(typingEnd.wpm).toFixed(1)} WPM / {Number(typingEnd.accuracy).toFixed(1)}%.</p>}
              </section>

              <section className="card progress-report-card">
                <div className="reports-section-heading"><div><span className="reports-eyebrow">Reading</span><h2>Reading & comprehension</h2></div></div>
                <div className="progress-skill-facts"><div><small>Logged minutes</small><strong>{metrics.readingMinutes}</strong></div><div><small>Comprehension average</small><strong>{pct(readingScoreAverage)}</strong></div><div><small>Activities</small><strong>{readingAttempts.length}</strong></div></div>
                <div className="progress-mini-list">{readingLogs.slice(0,5).map((log)=><div key={log.id}><span><strong>{log.title || 'Independent reading'}</strong><small>{dateLabel(log.read_on)}{log.pages?' • pages '+log.pages:''}</small></span><em>{log.minutes} min</em></div>)}</div>
              </section>

              <section className="card progress-report-card">
                <div className="reports-section-heading"><div><span className="reports-eyebrow">Writing</span><h2>Writing practice</h2></div></div>
                <div className="progress-skill-facts"><div><small>Submissions</small><strong>{writing.length}</strong></div><div><small>Reviewed</small><strong>{writing.filter((row)=>row.status==='reviewed').length}</strong></div><div><small>Total words</small><strong>{writing.reduce((sum,row)=>sum+Number(row.word_count),0)}</strong></div></div>
                <div className="progress-mini-list">{writing.filter((row)=>row.status!=='draft').slice(0,5).map((row)=>{const assignment=assignmentById.get(row.assignment_id);return <div key={row.id}><span><strong>{assignment?.title ?? 'Writing assignment'}</strong><small>{row.status==='reviewed'?'Reviewed':'Submitted'}{row.staff_feedback?' • Feedback saved':''}</small></span><em>{row.word_count} words</em></div>})}</div>
              </section>

              <section className="card progress-report-card">
                <div className="reports-section-heading"><div><span className="reports-eyebrow">Quizzes & skills</span><h2>Recent checks</h2></div></div>
                <div className="progress-mini-list">{quizzes.slice(0,8).map((row)=>{const assignment=assignmentById.get(row.assignment_id);return <div key={row.id}><span><strong>{assignment?.title ?? 'Quiz'}</strong><small>{dateLabel(row.created_at)} • {row.correct_count}/{row.question_count} correct</small></span><em>{Number(row.percent).toFixed(0)}%</em></div>})}{quizzes.length===0 && <div className="reports-empty">No quiz attempts in this period.</div>}</div>
              </section>

              <section className="card progress-report-card progress-feedback-card">
                <div className="reports-section-heading"><div><span className="reports-eyebrow">Feedback</span><h2>Recent staff feedback</h2></div></div>
                <div className="progress-feedback-list">
                  {[...writing.filter((row)=>row.staff_feedback).map((row)=>({id:'w'+row.id,title:assignmentById.get(row.assignment_id)?.title ?? 'Writing',feedback:row.staff_feedback!})),...readingAttempts.filter((row)=>row.staff_feedback).map((row)=>({id:'r'+row.id,title:assignmentById.get(row.assignment_id)?.title ?? 'Reading',feedback:row.staff_feedback!}))].slice(0,6).map((item)=><article key={item.id}><strong>{item.title}</strong><p>{item.feedback}</p></article>)}
                  {![...writing,...readingAttempts].some((row)=>Boolean(row.staff_feedback)) && <div className="reports-empty">No reviewed feedback in this period.</div>}
                </div>
              </section>
            </section>

            <section className="card progress-assignment-history">
              <div className="reports-section-heading"><div><span className="reports-eyebrow">Assignment history</span><h2>Work during this period</h2></div></div>
              <div className="reports-table-wrap"><table className="reports-table"><thead><tr><th>Assignment</th><th>Subject</th><th>Week</th><th>Status</th><th>Result</th></tr></thead><tbody>
                {studentAssignments.map((row)=>{const assignment=assignmentById.get(row.assignment_id);return <tr key={row.id}><td><strong>{assignment?.title ?? 'Assignment'}</strong>{assignment?.skill && <small className="progress-table-sub">{assignment.skill}</small>}</td><td>{assignment?subjectLabels[assignment.subject]:'—'}</td><td>{dateLabel(row.week_start)}</td><td><span className={'progress-status '+row.status}>{row.status.replace('_',' ')}</span></td><td>{row.score!=null && row.max_score ? Math.round(Number(row.score)/Number(row.max_score)*100)+'%' : row.minutes_spent!=null ? row.minutes_spent+' min' : '—'}</td></tr>})}
                {studentAssignments.length===0 && <tr><td colSpan={5} className="reports-empty">No assignments in this period.</td></tr>}
              </tbody></table></div>
            </section>

            <section className="card progress-internal-notes no-print">
              <div className="reports-section-heading"><div><span className="reports-eyebrow">Internal only</span><h2>Private staff Learning Notes</h2><p className="subtle">These notes are intentionally excluded from Print / Save PDF.</p></div><span className="badge">{notes.length}</span></div>
              <div className="progress-internal-list">{notes.map((note)=><article key={note.id}><small>{dateLabel(note.note_date)}</small><p>{note.note}</p></article>)}{notes.length===0 && <div className="reports-empty">No private Learning Notes in this period.</div>}</div>
            </section>
          </article>
        )}
      </main>
    </div>
  )
}
