'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Profile = { display_name: string; role: 'staff'|'admin'; active: boolean }
type ArchiveRow = {
  id: number
  child_id: number
  period_start: string
  period_end: string
  report_title: string
  status: 'finalized'|'archived'
  snapshot: any
  finalized_at: string
  archived_at: string | null
}

function dateLabel(value: string) {
  return new Date(value.slice(0,10)+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})
}
function pct(value: number | null | undefined) {
  return value == null ? '—' : Math.round(Number(value))+'%'
}
function subjectLabel(value: string) {
  const labels: Record<string,string> = {reading:'Reading',writing:'Writing',grammar:'Grammar',typing:'Typing',math:'Math',general:'General'}
  return labels[value] ?? value
}

export default function ArchivedProgressReportPage() {
  const params = useParams<{id:string}>()
  const reportId = Number(params?.id)
  const [session,setSession] = useState<Session|null>(null)
  const [profile,setProfile] = useState<Profile|null>(null)
  const [report,setReport] = useState<ArchiveRow|null>(null)
  const [loading,setLoading] = useState(true)
  const [message,setMessage] = useState('')

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{
      setSession(data.session)
      if(!data.session) setLoading(false)
    })
    const {data:listener}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next))
    return ()=>listener.subscription.unsubscribe()
  },[])

  useEffect(()=>{
    if(!session || !Number.isFinite(reportId)) return
    void load()
  },[session,reportId])

  async function load(){
    if(!session) return
    setLoading(true);setMessage('')
    const [profileResult,reportResult]=await Promise.all([
      supabase.from('staff_profiles').select('display_name,role,active').eq('user_id',session.user.id).maybeSingle(),
      supabase.from('learning_progress_report_archives')
        .select('id,child_id,period_start,period_end,report_title,status,snapshot,finalized_at,archived_at')
        .eq('id',reportId).maybeSingle(),
    ])
    setProfile(profileResult.data as Profile|null)
    setReport(reportResult.data as ArchiveRow|null)
    const error=profileResult.error ?? reportResult.error
    if(error) setMessage(error.message)
    setLoading(false)
  }

  if(loading && !session) return <main className="login-wrap"><div className="card login-card">Loading archived report…</div></main>
  if(!session) return <main className="login-wrap"><section className="card login-card"><h1>Archived Progress Report</h1><p className="subtle">Sign in through Juanita Hub to view this report.</p></section></main>
  if(!profile?.active) return <main className="login-wrap"><section className="card login-card"><h1>Archived Progress Report</h1><div className="notice">Your staff account must be active to view archived reports.</div></section></main>
  if(!report) return <div className="shell"><main className="main reports-page"><div className="notice">{message || 'That archived progress report could not be found.'}</div><Link className="ghost" href="/reports/progress">Back to Student Progress</Link></main></div>

  const s=report.snapshot ?? {}
  const student=s.student ?? {}
  const metrics=s.metrics ?? {}
  const subjects=Array.isArray(s.subjects)?s.subjects:[]
  const typing=s.typing ?? {}
  const reading=s.reading ?? {}
  const writing=Array.isArray(s.writing)?s.writing:[]
  const quizzes=Array.isArray(s.quizzes)?s.quizzes:[]
  const assignments=Array.isArray(s.assignments)?s.assignments:[]
  const goals=Array.isArray(s.goals)?s.goals:[]
  const achievements=Array.isArray(s.achievements)?s.achievements:[]

  return (
    <div className="shell">
      <header className="topbar no-print"><div className="brand">Juanita Hub<small>Archived Progress Report</small></div><div className="toolbar"><span>{profile.display_name} <span className="badge">{profile.role}</span></span></div></header>

      <main className="main reports-page progress-report-page archived-progress-page">
        <section className="hero reports-hero progress-report-hero no-print">
          <div><span className="reports-eyebrow">Frozen snapshot</span><h1>{report.report_title}</h1><p className="subtle">This saved report will not change when newer learning data is added.</p></div>
          <div className="progress-report-actions">
            <span className={'progress-report-state '+report.status}>{report.status}</span>
            <Link className="ghost" href={'/reports/progress?child='+report.child_id}>Back to live report</Link>
            <button className="primary" type="button" onClick={()=>window.print()}>Print / Save PDF</button>
          </div>
        </section>

        {message && <div className="notice no-print">{message}</div>}

        <article className="progress-print-sheet">
          <header className="card progress-report-header">
            <div className="progress-student-identity">
              <span className="progress-avatar">{String(student.first_name ?? student.name ?? '?')[0]?.toUpperCase()}</span>
              <div>
                <span className="reports-eyebrow">Student progress report</span>
                <h2>{student.name ?? 'Student'} {student.is_demo && <span className="children-demo-badge">Demo/Test</span>}</h2>
                <p>{[student.grade?'Grade '+student.grade:'',student.school ?? '',student.school_year ?? ''].filter(Boolean).join(' • ') || 'Student learning record'}</p>
              </div>
            </div>
            <div className="progress-period"><small>Reporting period</small><strong>{dateLabel(report.period_start)}</strong><span>through {dateLabel(report.period_end)}</span></div>
          </header>

          <section className="progress-archive-banner card">
            <span className={'progress-archive-status '+report.status}>{report.status}</span>
            <div><strong>Saved {new Date(report.finalized_at).toLocaleString()}</strong><small>{report.status==='archived' && report.archived_at ? 'Archived '+new Date(report.archived_at).toLocaleString() : 'Finalized snapshot'}</small></div>
          </section>

          <section className="reports-metric-grid progress-metric-grid">
            <article className="card reports-metric"><span>Assignment completion</span><strong>{pct(metrics.completion)}</strong><small>{Number(metrics.completed ?? 0)}/{Number(metrics.assigned ?? 0)} completed</small></article>
            <article className="card reports-metric"><span>Quiz average</span><strong>{pct(metrics.quizAverage)}</strong><small>{Number(metrics.quiz_attempts ?? quizzes.length)} attempts</small></article>
            <article className="card reports-metric"><span>Reading</span><strong>{Number(metrics.readingMinutes ?? 0)}</strong><small>logged minutes</small></article>
            <article className="card reports-metric"><span>Typing accuracy</span><strong>{pct(metrics.typingAccuracy)}</strong><small>{Number(metrics.typing_attempts ?? typing.attempts?.length ?? 0)} attempts</small></article>
            <article className="card reports-metric"><span>Writing</span><strong>{Number(metrics.writingCount ?? writing.length)}</strong><small>{Number(metrics.reviewedWriting ?? 0)} reviewed</small></article>
          </section>

          <section className="card progress-family-summary">
            <div className="reports-section-heading"><div><span className="reports-eyebrow">Finalized comment</span><h2>Progress summary</h2></div></div>
            <div className="progress-summary-archive">{String(s.report_comment ?? '').trim() || 'No report comment was saved for this snapshot.'}</div>
          </section>

          {(goals.length>0 || achievements.length>0) && <section className="progress-report-grid">
            <section className="card progress-report-card">
              <div className="reports-section-heading"><div><span className="reports-eyebrow">Goals</span><h2>Goals during this period</h2></div></div>
              <div className="progress-archive-goals">
                {goals.map((goal:any)=><article key={goal.id}><span>🎯</span><span><strong>{goal.title}</strong><small>{goal.status} • {goal.reward_points ?? 1} point goal</small></span></article>)}
              </div>
            </section>
            <section className="card progress-report-card">
              <div className="reports-section-heading"><div><span className="reports-eyebrow">Achievements</span><h2>Milestones unlocked</h2></div></div>
              <div className="progress-archive-achievements">
                {achievements.map((achievement:any)=><article key={achievement.id}><span>{achievement.icon}</span><span><strong>{achievement.title}</strong><small>{achievement.description}</small></span></article>)}
              </div>
            </section>
          </section>}

          <section className="progress-report-grid">
            <section className="card progress-report-card">
              <div className="reports-section-heading"><div><span className="reports-eyebrow">Overview</span><h2>Subject completion</h2></div></div>
              <div className="progress-subject-list">
                {subjects.map((row:any)=><article key={row.subject}><span className="progress-subject-icon">📘</span><span><strong>{subjectLabel(row.subject)}</strong><small>{row.completed}/{row.assigned} completed</small><span className="progress-track"><i style={{width:(row.completion ?? 0)+'%'}} /></span></span><em>{row.completion==null?'—':row.completion+'%'}</em></article>)}
                {subjects.length===0 && <div className="reports-empty">No assignments were recorded in this period.</div>}
              </div>
            </section>

            <section className="card progress-report-card">
              <div className="reports-section-heading"><div><span className="reports-eyebrow">Typing</span><h2>Keyboard fluency</h2></div></div>
              <div className="progress-skill-facts"><div><small>Average WPM</small><strong>{metrics.typingWpm==null?'—':Number(metrics.typingWpm).toFixed(1)}</strong></div><div><small>Average accuracy</small><strong>{pct(metrics.typingAccuracy)}</strong></div><div><small>Attempts</small><strong>{typing.attempts?.length ?? 0}</strong></div></div>
              {typing.first && typing.latest && typing.attempts?.length>1 && <p className="progress-trend-note">First attempt: {Number(typing.first.wpm).toFixed(1)} WPM / {Number(typing.first.accuracy).toFixed(1)}% accuracy → latest: {Number(typing.latest.wpm).toFixed(1)} WPM / {Number(typing.latest.accuracy).toFixed(1)}%.</p>}
            </section>

            <section className="card progress-report-card">
              <div className="reports-section-heading"><div><span className="reports-eyebrow">Reading</span><h2>Reading & comprehension</h2></div></div>
              <div className="progress-skill-facts"><div><small>Logged minutes</small><strong>{Number(metrics.readingMinutes ?? 0)}</strong></div><div><small>Comprehension average</small><strong>{pct(metrics.reading_score_average)}</strong></div><div><small>Activities</small><strong>{reading.attempts?.length ?? 0}</strong></div></div>
              <div className="progress-mini-list">{(reading.logs ?? []).slice(0,5).map((log:any)=><div key={log.id}><span><strong>{log.title || 'Independent reading'}</strong><small>{dateLabel(log.read_on)}{log.pages?' • pages '+log.pages:''}</small></span><em>{log.minutes} min</em></div>)}</div>
            </section>

            <section className="card progress-report-card">
              <div className="reports-section-heading"><div><span className="reports-eyebrow">Writing</span><h2>Writing practice</h2></div></div>
              <div className="progress-skill-facts"><div><small>Submissions</small><strong>{writing.length}</strong></div><div><small>Reviewed</small><strong>{writing.filter((row:any)=>row.status==='reviewed').length}</strong></div><div><small>Total words</small><strong>{Number(metrics.total_writing_words ?? 0)}</strong></div></div>
              <div className="progress-mini-list">{writing.filter((row:any)=>row.status!=='draft').slice(0,5).map((row:any)=><div key={row.id}><span><strong>{row.assignment_title ?? 'Writing assignment'}</strong><small>{row.status==='reviewed'?'Reviewed':'Submitted'}{row.staff_feedback?' • Feedback saved':''}</small></span><em>{row.word_count} words</em></div>)}</div>
            </section>

            <section className="card progress-report-card">
              <div className="reports-section-heading"><div><span className="reports-eyebrow">Quizzes & skills</span><h2>Recent checks</h2></div></div>
              <div className="progress-mini-list">{quizzes.slice(0,8).map((row:any)=><div key={row.id}><span><strong>{row.assignment_title ?? 'Quiz'}</strong><small>{dateLabel(row.created_at)} • {row.correct_count}/{row.question_count} correct</small></span><em>{Number(row.percent).toFixed(0)}%</em></div>)}{quizzes.length===0 && <div className="reports-empty">No quiz attempts in this period.</div>}</div>
            </section>

            <section className="card progress-report-card progress-feedback-card">
              <div className="reports-section-heading"><div><span className="reports-eyebrow">Feedback</span><h2>Saved staff feedback</h2></div></div>
              <div className="progress-feedback-list">
                {[...writing.filter((row:any)=>row.staff_feedback).map((row:any)=>({id:'w'+row.id,title:row.assignment_title ?? 'Writing',feedback:row.staff_feedback})),...(reading.attempts ?? []).filter((row:any)=>row.staff_feedback).map((row:any)=>({id:'r'+row.id,title:'Reading activity',feedback:row.staff_feedback}))].slice(0,6).map((item:any)=><article key={item.id}><strong>{item.title}</strong><p>{item.feedback}</p></article>)}
              </div>
            </section>
          </section>

          <section className="card progress-assignment-history">
            <div className="reports-section-heading"><div><span className="reports-eyebrow">Assignment history</span><h2>Work saved in this snapshot</h2></div></div>
            <div className="reports-table-wrap"><table className="reports-table"><thead><tr><th>Assignment</th><th>Subject</th><th>Week</th><th>Status</th><th>Result</th></tr></thead><tbody>
              {assignments.map((row:any)=><tr key={row.id}><td><strong>{row.assignment_title ?? 'Assignment'}</strong>{row.skill && <small className="progress-table-sub">{row.skill}</small>}</td><td>{row.subject?subjectLabel(row.subject):'—'}</td><td>{dateLabel(row.week_start)}</td><td><span className={'progress-status '+row.status}>{String(row.status).replace('_',' ')}</span></td><td>{row.score!=null && row.max_score ? Math.round(Number(row.score)/Number(row.max_score)*100)+'%' : row.minutes_spent!=null ? row.minutes_spent+' min' : '—'}</td></tr>)}
              {assignments.length===0 && <tr><td colSpan={5} className="reports-empty">No assignments were saved in this snapshot.</td></tr>}
            </tbody></table></div>
          </section>
        </article>
      </main>
    </div>
  )
}
