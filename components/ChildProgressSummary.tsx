'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { StudentGoalView, StudentAchievementView } from '@/components/StudentMyWeek'

type Props = {
  childId: number
  childName: string
  grade: string | null
  isDemo: boolean
}

type StudentAssignment = { id: number; assignment_id: number; status: 'assigned'|'in_progress'|'completed'|'skipped'; week_start: string }
type QuizAttempt = { id: number; percent: number; created_at: string }
type TypingAttempt = { id: number; wpm: number; accuracy: number; created_at: string }
type ReadingLog = { id: number; minutes: number; read_on: string }
type WritingSubmission = { id: number; status: 'draft'|'submitted'|'reviewed'; word_count: number; updated_at: string }

function localDate() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0,10)
}
function shiftDays(value: string, days: number) {
  const [y,m,d] = value.split('-').map(Number)
  const date = new Date(y,m-1,d)
  date.setDate(date.getDate()+days)
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')
}
function avg(values: number[]) {
  return values.length ? values.reduce((sum,value)=>sum+value,0)/values.length : null
}
function goalProgress(goal: StudentGoalView) {
  const repeated=['quiz_consistency','typing_accuracy','custom'].includes(goal.goal_type)
  const current=repeated?Number(goal.current_count):Number(goal.current_value)
  const target=repeated?Number(goal.target_count):Number(goal.target_value)
  return Math.max(0,Math.min(100,target?Math.round(current/target*100):0))
}

export default function ChildProgressSummary({ childId, childName, grade, isDemo }: Props) {
  const [assignments, setAssignments] = useState<StudentAssignment[]>([])
  const [quizzes, setQuizzes] = useState<QuizAttempt[]>([])
  const [typing, setTyping] = useState<TypingAttempt[]>([])
  const [reading, setReading] = useState<ReadingLog[]>([])
  const [writing, setWriting] = useState<WritingSubmission[]>([])
  const [goals, setGoals] = useState<StudentGoalView[]>([])
  const [achievements, setAchievements] = useState<StudentAchievementView[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => { void load() }, [childId])

  async function load() {
    setLoading(true)
    setMessage('')
    const end = localDate()
    const start = shiftDays(end,-89)
    const startIso = start + 'T00:00:00'
    const endIso = end + 'T23:59:59.999'

    const [assignmentRows, quizRows, typingRows, readingRows, writingRows, goalRows, achievementRows] = await Promise.all([
      supabase.from('learning_student_assignments').select('id,assignment_id,status,week_start').eq('child_id',childId).gte('week_start',start).lte('week_start',end),
      supabase.from('learning_quiz_attempts').select('id,percent,created_at').eq('child_id',childId).gte('created_at',startIso).lte('created_at',endIso),
      supabase.from('learning_typing_attempts').select('id,wpm,accuracy,created_at').eq('child_id',childId).gte('created_at',startIso).lte('created_at',endIso).order('created_at',{ascending:true}),
      supabase.from('learning_reading_logs').select('id,minutes,read_on').eq('child_id',childId).gte('read_on',start).lte('read_on',end),
      supabase.from('learning_writing_submissions').select('id,status,word_count,updated_at').eq('child_id',childId).gte('updated_at',startIso).lte('updated_at',endIso),
      supabase.rpc('refresh_learning_goals',{p_child_id:childId}),
      supabase.rpc('refresh_learning_achievements',{p_child_id:childId}),
    ])
    const error = assignmentRows.error ?? quizRows.error ?? typingRows.error ?? readingRows.error ?? writingRows.error ?? goalRows.error ?? achievementRows.error
    if (error) setMessage(error.message)
    setAssignments((assignmentRows.data ?? []) as StudentAssignment[])
    setQuizzes((quizRows.data ?? []) as QuizAttempt[])
    setTyping((typingRows.data ?? []) as TypingAttempt[])
    setReading((readingRows.data ?? []) as ReadingLog[])
    setWriting((writingRows.data ?? []) as WritingSubmission[])
    setGoals(((goalRows.data ?? []) as StudentGoalView[]).filter((goal)=>['active','reached','approved'].includes(goal.status)).slice(0,6))
    setAchievements(((achievementRows.data ?? []) as StudentAchievementView[]).slice(0,8))
    setLoading(false)
  }

  const metrics = useMemo(() => {
    const counted = assignments.filter((row)=>row.status!=='skipped')
    const completed = counted.filter((row)=>row.status==='completed').length
    const quizAverage = avg(quizzes.map((row)=>Number(row.percent)))
    const typingAccuracy = avg(typing.map((row)=>Number(row.accuracy)))
    const readingMinutes = reading.reduce((sum,row)=>sum+Number(row.minutes),0)
    const reviewedWriting = writing.filter((row)=>row.status==='reviewed').length
    const firstTyping = typing[0]
    const latestTyping = typing[typing.length-1]
    return {
      completion: counted.length ? Math.round(completed/counted.length*100) : null,
      completed,
      assigned: counted.length,
      quizAverage,
      typingAccuracy,
      readingMinutes,
      writingCount: writing.length,
      reviewedWriting,
      firstTyping,
      latestTyping,
    }
  },[assignments,quizzes,typing,reading,writing])

  return (
    <section className="child-progress-tab">
      <div className="child-progress-heading">
        <div><span className="children-eyebrow">Progress snapshot</span><h3>{childName}{isDemo ? ' • Demo/Test' : ''}</h3><p>{grade ? 'Grade '+grade+' • ' : ''}Last 90 days of Juanita Hub Learning activity.</p></div>
        <Link className="primary" href={'/reports/progress?child='+childId}>Open full progress report</Link>
      </div>

      {message && <div className="notice">{message}</div>}
      {loading ? <div className="children-empty-inline">Loading progress…</div> : (
        <>
          <div className="child-progress-metrics">
            <article><small>Assignment completion</small><strong>{metrics.completion==null?'—':metrics.completion+'%'}</strong><span>{metrics.completed}/{metrics.assigned} completed</span></article>
            <article><small>Quiz average</small><strong>{metrics.quizAverage==null?'—':Math.round(metrics.quizAverage)+'%'}</strong><span>{quizzes.length} attempt{quizzes.length===1?'':'s'}</span></article>
            <article><small>Reading</small><strong>{metrics.readingMinutes}</strong><span>minutes logged</span></article>
            <article><small>Typing accuracy</small><strong>{metrics.typingAccuracy==null?'—':Math.round(metrics.typingAccuracy)+'%'}</strong><span>{typing.length} attempt{typing.length===1?'':'s'}</span></article>
            <article><small>Writing</small><strong>{metrics.writingCount}</strong><span>{metrics.reviewedWriting} reviewed</span></article>
          </div>

          {(goals.length>0 || achievements.length>0) && <div className="child-progress-motivation">
            {goals.length>0 && <section className="child-progress-goals">
              <div className="child-learning-block-heading"><div><small>Current goals</small><h4>Working toward +1</h4></div><Link className="ghost" href="/learning#goals">Manage goals</Link></div>
              <div className="child-progress-goal-list">{goals.slice(0,4).map((goal)=>{
                const progress=goalProgress(goal)
                return <article key={goal.id} className={goal.status}>
                  <span>🎯</span>
                  <span><strong>{goal.title}</strong><small>{goal.status==='approved'?'Bonus point earned':goal.status==='reached'?'Reached • waiting for approval':progress+'% complete'}</small><span className="child-progress-goal-track"><i style={{width:progress+'%'}} /></span></span>
                  <em>{goal.status==='approved'?'+1':goal.status==='reached'?'Ready':'In progress'}</em>
                </article>
              })}</div>
            </section>}
            {achievements.length>0 && <section className="child-progress-achievements">
              <div className="child-learning-block-heading"><div><small>Milestones</small><h4>Achievements</h4></div><span>{achievements.length}</span></div>
              <div className="child-progress-achievement-grid">{achievements.slice(0,6).map((achievement)=><article key={achievement.id}><span>{achievement.icon}</span><strong>{achievement.title}</strong><small>{achievement.description}</small></article>)}</div>
            </section>}
          </div>}

          <div className="child-progress-insights">
            <article>
              <span>⌨️</span>
              <div><small>Typing trend</small><strong>{metrics.latestTyping ? Number(metrics.latestTyping.wpm).toFixed(1)+' WPM • '+Number(metrics.latestTyping.accuracy).toFixed(1)+'%' : 'No typing attempts yet'}</strong>{metrics.firstTyping && metrics.latestTyping && typing.length>1 && <p>Started this period at {Number(metrics.firstTyping.wpm).toFixed(1)} WPM / {Number(metrics.firstTyping.accuracy).toFixed(1)}% accuracy.</p>}</div>
            </article>
            <article>
              <span>✍️</span>
              <div><small>Writing activity</small><strong>{writing.length ? writing.reduce((sum,row)=>sum+Number(row.word_count),0)+' words across '+writing.length+' submission'+(writing.length===1?'':'s') : 'No writing submissions yet'}</strong><p>Drafts remain available for the student to resume in Student Learning.</p></div>
            </article>
          </div>

          <div className="child-progress-footer">
            <span>The full report includes subject completion, quizzes, typing, reading, writing, staff feedback, assignment history, and a printable progress summary.</span>
            <Link className="ghost" href="/learning#review">Open Learning Review Center</Link>
          </div>
        </>
      )}
    </section>
  )
}
