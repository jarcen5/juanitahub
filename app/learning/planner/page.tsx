'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import {
  makeWeeklyPlans,
  type PlannerAssignment,
  type PlannerChild,
  type PlannerHistory,
  type PlannerHomework,
  type PlannerStudentPlan,
  type PlannerWeeklyAssignment,
  type PlannerSettings,
  type PlannerSubject,
} from '@/lib/learningWeeklyPlanner'
import './planner.css'

type Profile = { role: 'staff' | 'admin'; active: boolean; display_name: string }
type Registration = { child_id: number; grade: string | null }

const subjectIcons: Record<PlannerSubject, string> = {
  reading: '📖', writing: '✍️', grammar: '🔤', typing: '⌨️', math: '➗', general: '🌟',
}

function localToday() {
  const now = new Date()
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-')
}
function mondayFor(date: string) {
  const d = new Date(date + 'T12:00:00')
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-')
}
function datePlus(date: string, days: number) {
  const d = new Date(date + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-')
}
function childName(c: PlannerChild) { return c.first_name + (c.last_name ? ' '+c.last_name : '') }
const defaultSettings: PlannerSettings = {
  target: 3, focus: 'balanced', difficulty: 'any', interactiveOnly: true, grades: {},
}
const publicLiveHosts = new Set(['juanitahub.vercel.app','juanitahub-jsclc.vercel.app'])

async function loadWeekRows(week: string) {
  const result=await supabase.from('learning_student_assignments')
    .select('id,child_id,assignment_id,schedule_id,is_optional').eq('week_start',week)
  if(!result.error)return result
  return supabase.from('learning_student_assignments')
    .select('id,child_id,assignment_id,schedule_id').eq('week_start',week)
}

async function allHistory(): Promise<PlannerHistory[]> {
  const rows: PlannerHistory[] = []
  const pageSize = 400
  for (let offset=0; ; offset+=pageSize) {
    const result = await supabase.from('learning_student_assignments')
      .select('child_id,assignment_id,status,week_start,completed_at')
      .order('week_start',{ascending:false})
      .order('id',{ascending:false})
      .range(offset,offset+pageSize-1)
    if (result.error) throw result.error
    rows.push(...((result.data ?? []) as PlannerHistory[]))
    if (!result.data || result.data.length < pageSize) break
  }
  return rows
}

export default function LearningWeeklyPlanner() {
  const [session, setSession] = useState<Session | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageKind, setMessageKind] = useState<'info'|'success'|'error'>('info')
  const [weekStart, setWeekStart] = useState(() => mondayFor(localToday()))
  const [reloadKey, setReloadKey] = useState(0)
  const [children, setChildren] = useState<PlannerChild[]>([])
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [library, setLibrary] = useState<PlannerAssignment[]>([])
  const [weekly, setWeekly] = useState<PlannerWeeklyAssignment[]>([])
  const [homework, setHomework] = useState<PlannerHomework[]>([])
  const [history, setHistory] = useState<PlannerHistory[]>([])
  const [settings, setSettings] = useState<PlannerSettings>(defaultSettings)
  const [includeDemo, setIncludeDemo] = useState(false)
  const [studentSearch, setStudentSearch] = useState('')
  const [filterGrade, setFilterGrade] = useState('all')
  const [plan, setPlan] = useState<PlannerStudentPlan[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [dueDate, setDueDate] = useState('')
  const [isProduction, setIsProduction] = useState(false)

  const endOfWeek = datePlus(weekStart,6)

  useEffect(() => {
    setIsProduction(publicLiveHosts.has(window.location.hostname))
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({data}) => {
      if (!active) return
      setSession(data.session)
      setAuthChecked(true)
      if (!data.session) setLoading(false)
    }).catch(() => {
      if (active) { setAuthChecked(true); setLoading(false); setMessage('Could not verify your staff session. Please refresh.'); setMessageKind('error') }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event,s) => {
      if (active) { setSession(s); setAuthChecked(true) }
    })
    return () => { active=false;listener.subscription.unsubscribe() }
  },[])

  useEffect(() => {
    if (!session) { setProfile(null); return }
    let active = true
    async function load() {
      setLoading(true)
      setMessage('')
      setProfile(null)
      setChildren([])
      setRegistrations([])
      setLibrary([])
      setWeekly([])
      setHomework([])
      setHistory([])
      setPlan(null)
      setSelected([])
      try {
        // Check staff authorization before requesting any student or assignment data.
        const p = await supabase.from('staff_profiles')
          .select('role,active,display_name').eq('user_id',session!.user.id).maybeSingle()
        if (!active) return
        if (p.error) throw p.error
        const candidate = p.data as Profile | null
        setProfile(candidate)
        if (!candidate?.active) return
        const [c,r,l,w,h,all] = await Promise.all([
          supabase.from('children').select('id,first_name,last_name,is_demo').eq('active',true).order('first_name').order('last_name'),
          supabase.from('child_registrations').select('child_id,grade').eq('status','active'),
          supabase.from('learning_assignments').select('id,title,subject,assignment_type,grade_levels,skill,difficulty,delivery_format,active,activity_config').eq('active',true),
          loadWeekRows(weekStart),
          supabase.from('learning_homework_tasks').select('id,child_id').eq('week_start',weekStart),
          allHistory(),
        ])
        if (!active) return
        const error = c.error || r.error || l.error || w.error || h.error
        if (error) throw error
        setChildren((c.data ?? []) as PlannerChild[])
        setRegistrations((r.data ?? []) as Registration[])
        setLibrary((l.data ?? []) as PlannerAssignment[])
        setWeekly((w.data ?? []) as PlannerWeeklyAssignment[])
        setHomework((h.data ?? []) as PlannerHomework[])
        setHistory(all)
      } catch (e) {
        if (active) { setMessage(e instanceof Error ? e.message : 'The weekly plan could not be loaded.'); setMessageKind('error') }
      } finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  },[session,weekStart,reloadKey])

  function updateSettings(next: Partial<PlannerSettings>) {
    setSettings(s => ({...s,...next}))
    setPlan(null)
    setSelected([])
  }
  const grades = useMemo(() => [...new Set([...Array.from({length:8},(_,i)=>String(i+1)),...registrations.map(r=>r.grade||'').filter(Boolean)])].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[registrations])
  const visibleChildren = useMemo(() => children.filter(c => (includeDemo || !c.is_demo) &&
    (filterGrade === 'all' || registrations.find(r=>r.child_id===c.id)?.grade===filterGrade) &&
    childName(c).toLowerCase().includes(studentSearch.trim().toLowerCase())),[children,includeDemo,filterGrade,studentSearch,registrations])
  const resultSummary = useMemo(() => {
    const lines = (plan??[]).flatMap(p=>p.suggestions)
    const chosen = lines.filter(line=>selected.includes(line.childId+':'+line.assignmentId))
    return {students:new Set(chosen.map(l=>l.childId)).size, activities:chosen.length, missingGrades:(plan??[]).filter(p=>!p.grade).length, complete:(plan??[]).filter(p=>p.existing>=settings.target).length}
  },[plan,selected,settings.target])

  function changeLearningLevel(childId: number, grade: string) {
    const nextSettings = { ...settings, grades: { ...settings.grades, [childId]: grade } }
    setSettings(nextSettings)
    if (!plan) return
    const nextPlans = makeWeeklyPlans({
      children: visibleChildren, registrations, library, history,
      weekly, homework, weekStart, settings: nextSettings,
    })
    const previousKeys = new Set(plan.flatMap(p=>p.suggestions.map(a=>a.childId+':'+a.assignmentId)))
    setSelected(oldSelected => nextPlans.flatMap(p=>p.suggestions.map(a=>a.childId+':'+a.assignmentId))
      .filter(key => key.startsWith(childId+':') || !previousKeys.has(key) || oldSelected.includes(key)))
    setPlan(nextPlans)
  }

  function generate() {
    if (!profile?.active || loading) return
    const result = makeWeeklyPlans({children:visibleChildren,registrations,library,history,weekly,homework,weekStart,settings})
    setPlan(result)
    setSelected(result.flatMap(p=>p.suggestions.map(line=>line.childId+':'+line.assignmentId)))
    setMessage('')
  }

  async function apply() {
    if (!isProduction) return
    if (!session || !profile?.active || saving || !plan) return
    const original = plan.flatMap(p=>p.suggestions).filter(l=>selected.includes(l.childId+':'+l.assignmentId))
    if (!original.length) return
    if (!window.confirm('Assign '+original.length+' reviewed activities to '+resultSummary.students+' students for the week of '+weekStart+'? This will change student My Week lists.')) return
    setSaving(true);setMessage('')
    try {
      // Recheck both duplicates and weekly workload at save time so a coworker's
      // recent changes cannot silently overload a child.
      const [live, liveHomework] = await Promise.all([
        supabase.from('learning_student_assignments')
          .select('id,child_id,assignment_id,schedule_id').eq('week_start',weekStart),
        supabase.from('learning_homework_tasks').select('id,child_id').eq('week_start',weekStart),
      ])
      if (live.error || liveHomework.error) throw live.error ?? liveHomework.error
      const taken = new Set((live.data??[]).map(r=>r.child_id+':'+r.assignment_id))
      const alreadyByChild = new Map<number, Set<string>>()
      for (const row of live.data??[]) {
        const keys=alreadyByChild.get(row.child_id)??new Set<string>()
        if(!(row as {is_optional?: boolean}).is_optional)keys.add(row.schedule_id?'schedule-'+row.schedule_id:'row-'+row.id)
        alreadyByChild.set(row.child_id,keys)
      }
      const currentWorkload = new Map<number,number>()
      for(const [id,keys] of alreadyByChild) currentWorkload.set(id,keys.size)
      for(const task of liveHomework.data??[]) currentWorkload.set(task.child_id,(currentWorkload.get(task.child_id)??0)+1)
      const rows: Array<{child_id:number;assignment_id:number;week_start:string;due_date:string|null;assigned_by:string;updated_by:string}>=[]
      for(const item of original){
        const key=item.childId+':'+item.assignmentId
        if(taken.has(key) || (currentWorkload.get(item.childId)??0)>=settings.target) continue
        rows.push({child_id:item.childId,assignment_id:item.assignmentId,week_start:weekStart,
          due_date:dueDate||null,assigned_by:session.user.id,updated_by:session.user.id})
        taken.add(key)
        currentWorkload.set(item.childId,(currentWorkload.get(item.childId)??0)+1)
      }
      if (!rows.length) throw new Error('These activities are already assigned, or the children now meet their workload limits. Refresh to review the latest week.')
      const {error} = await supabase.from('learning_student_assignments').insert(rows)
      if (error) throw error
      setPlan(null);setSelected([])
      setMessage('Assigned '+rows.length+' activities. '+(original.length-rows.length)+' duplicates were skipped. Open This Week to review.')
      setMessageKind('success')
      const [w,h] = await Promise.all([
        loadWeekRows(weekStart),
        supabase.from('learning_homework_tasks').select('id,child_id').eq('week_start',weekStart),
      ])
      if (!w.error) setWeekly((w.data??[]) as PlannerWeeklyAssignment[])
      if (!h.error) setHomework((h.data??[]) as PlannerHomework[])
      const latest = await allHistory()
      setHistory(latest)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'The weekly plan could not be saved. Check This Week before trying again.')
      setMessageKind('error')
    } finally { setSaving(false) }
  }

  if (!authChecked || loading && !profile) return <main className="main"><section className="card">Loading Smart Weekly Planner…</section></main>
  if (!session) return <main className="main"><section className="card"><h1>Smart Weekly Planner</h1><p>Sign in as staff to review weekly learning plans.</p><a className="primary" href="/">Staff sign-in</a></section></main>
  if (!profile?.active) return <main className="main"><section className="card"><h1>Smart Weekly Planner</h1><p>This page requires an active staff account.</p><a href="/learning">Return to Learning</a></section></main>

  return <main className="main jh-planner-page">
    <section className="jh-planner-hero">
      <div><span className="jh-planner-kicker">Learning Hub · Workload relief</span><h1>Smart Weekly Planner</h1><p>Build a balanced learning plan for many children at once. Juanita Hub suggests activities using learning level, previous assignments, and the work already on each child’s list. You choose what gets assigned.</p></div>
      <a className="ghost jh-planner-back" href="/learning#week">← Back to This Week</a>
    </section>
    {!isProduction && <section className="jh-planner-preview" role="status"><strong>Preview mode</strong> — Explore plans and change suggestions safely. Assigning new work is disabled on preview deployments, so no live student records are affected.</section>}
    {message && <div className={'notice '+(messageKind==='error'?'error':messageKind==='success'?'success':'')} role="status" aria-live="polite">{message}</div>}

    <section className="card jh-planner-config">
      <div className="jh-planner-heading"><div><span className="jh-planner-kicker">Step 1</span><h2>Set up the week</h2><p>Keep the workload manageable. Assigned homework and recurring practice already count toward the target.</p></div><a href="/learning#library">Browse Assignment Library</a></div>
      <div className="jh-planner-controls">
        <label className="field"><span>Week beginning</span><input type="date" value={weekStart} onChange={e=>{if(e.target.value)setWeekStart(mondayFor(e.target.value));setDueDate('')}} /></label>
        <label className="field"><span>Target total activities per child</span><select value={settings.target} onChange={e=>updateSettings({target:Number(e.target.value)})}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} activities</option>)}</select></label>
        <label className="field"><span>Subject emphasis</span><select value={settings.focus} onChange={e=>updateSettings({focus:e.target.value as PlannerSettings['focus']})}><option value="balanced">Balanced subjects</option><option value="reading">Reading & literacy</option><option value="math">Math</option><option value="typing">Typing</option></select></label>
        <label className="field"><span>Difficulty</span><select value={settings.difficulty} onChange={e=>updateSettings({difficulty:e.target.value as PlannerSettings['difficulty']})}><option value="any">Mix support & standard</option><option value="support">Foundational / support</option><option value="standard">Standard</option><option value="challenge">Challenge</option></select></label>
      </div>
      <label className="jh-planner-check"><input type="checkbox" checked={settings.interactiveOnly} onChange={e=>updateSettings({interactiveOnly:e.target.checked})}/><span>Suggest independent digital activities only <small>Best for students working without constant staff assistance.</small></span></label>
      <div className="jh-planner-students">
        <label className="field"><span>Students</span><select value={filterGrade} onChange={e=>{setFilterGrade(e.target.value);setPlan(null)}}><option value="all">All active grades</option>{grades.map(g=><option key={g} value={g}>Grade {g}</option>)}</select></label>
        <label className="field"><span>Find a child</span><input type="search" value={studentSearch} onChange={e=>{setStudentSearch(e.target.value);setPlan(null)}} placeholder="Name…" /></label>
        <label className="jh-planner-check"><input type="checkbox" checked={includeDemo} onChange={e=>{setIncludeDemo(e.target.checked);setPlan(null)}}/><span>Include test students</span></label>
        <strong>{visibleChildren.length} selected</strong>
      </div>
      <div className="jh-planner-config-footer">
        <span>Suggestions are generated locally. They do not save assignments.</span>
        <button className="ghost" type="button" onClick={()=>setReloadKey(n=>n+1)} disabled={loading||saving}>↻ Refresh student work</button>
        <button className="primary" type="button" onClick={generate} disabled={loading||!visibleChildren.length}>{loading?'Loading…':plan?'↻ Regenerate suggestions':'✨ Suggest weekly plans'}</button>
      </div>
    </section>

    <section className="card jh-planner-guide">
      <span className="jh-planner-step">Student independence · Optional practice</span>
      <div><strong>Staff-Approved Student Choice Board</strong><p>Publish suitable activities once, set learning levels and weekly limits, and let children choose optional work without changing recurring assignments or required learning goals.</p>
      <a href="/learning/choice-board">Open Student Choice Board →</a></div>
    </section>

    {plan && <section className="jh-planner-results" aria-label="Weekly plan suggestions">
      <div className="jh-planner-results-header">
        <div><span className="jh-planner-kicker">Step 2 · Review before assigning</span><h2>Suggested plans</h2><p>{resultSummary.activities} selected activities for {resultSummary.students} children. Existing school homework and assigned work remain unchanged.</p></div>
        <div className="jh-planner-summary">
          <span><strong>{resultSummary.activities}</strong> new activities</span>
          <span><strong>{resultSummary.complete}</strong> already at target</span>
          <span><strong>{resultSummary.missingGrades}</strong> need level review</span>
        </div>
      </div>
      <div className="jh-planner-plan-list">
        {plan.map(studentPlan => {
          const picked=studentPlan.suggestions.filter(a=>selected.includes(a.childId+':'+a.assignmentId)).length
          return <details key={studentPlan.child.id} className="card jh-planner-child">
            <summary>
              <span className="jh-planner-avatar">{studentPlan.child.first_name.slice(0,1).toUpperCase()}</span>
              <span className="jh-planner-child-label"><strong>{childName(studentPlan.child)}{studentPlan.child.is_demo?' · Demo':''}</strong><small>{studentPlan.grade?'Learning level '+studentPlan.grade:'Level not set'} · {studentPlan.existing} already on list</small></span>
              <span className="jh-planner-child-count">{picked ? picked+' selected' : studentPlan.message||'No new work'}</span>
            </summary>
            <div className="jh-planner-child-body">
              <label className="field jh-planner-level"><span>Learning level for this plan <small>(temporary override, not saved to profile)</small></span><select value={settings.grades[studentPlan.child.id]||''} onChange={e=>changeLearningLevel(studentPlan.child.id,e.target.value)}><option value="">Use registered grade</option>{grades.map(g=><option key={g} value={g}>Level {g}</option>)}</select></label>
              {studentPlan.message && <p className="jh-planner-child-note">{studentPlan.message}</p>}
              {studentPlan.suggestions.map(s=>{
                const key=s.childId+':'+s.assignmentId
                return <label className="jh-planner-suggestion" key={key}>
                  <input type="checkbox" checked={selected.includes(key)} onChange={e=>setSelected(current=>e.target.checked?[...current,key]:current.filter(x=>x!==key))}/>
                  <span className="jh-planner-subject">{subjectIcons[s.subject]}</span>
                  <span><strong>{s.title}</strong><small>{s.reason} · {s.subject} · {s.difficulty}</small></span>
                </label>
              })}
              {Boolean(settings.grades[studentPlan.child.id]) && <small>Suggestions above now reflect this temporary learning level.</small>}
            </div>
          </details>
        })}
      </div>
      <section className="card jh-planner-approve">
        <div>
          <strong>{resultSummary.activities} reviewed assignment{resultSummary.activities===1?'':'s'}</strong>
          <p>Nothing is added until you choose Assign selected work. Repeated assignments for the same child and week are skipped.</p>
          <label className="field"><span>Due date (optional)</span><input type="date" min={weekStart} max={endOfWeek} value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>
        </div>
        <button className="primary" type="button" disabled={!isProduction||saving||!resultSummary.activities||loading} onClick={()=>void apply()}>{saving?'Assigning…':isProduction?'Assign selected work':'Preview only · saving disabled'}</button>
      </section>
    </section>}
    <p className="jh-planner-footer">Transparent recommendations — based on grade/learning level, activity history, subject variety, and available assignments. Staff always have the final decision.</p>
  </main>
}
