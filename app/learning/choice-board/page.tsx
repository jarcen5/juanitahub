'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import LearningChoiceBoard, { type ChoiceBoardData, type ChoiceActivity } from '@/components/LearningChoiceBoard'
import './choice-board-admin.css'

type StaffProfile = { active: boolean; role: 'staff' | 'admin' }
type Activity = ChoiceActivity & {
  grade_levels: string[]
  active: boolean
  difficulty: 'support' | 'standard' | 'challenge'
  delivery_format: string
  activity_config: { experience?: string } | null
}
type Child = { id: number; first_name: string; last_name: string | null; is_demo: boolean }
type Registration = { child_id: number; grade: string | null }
type BoardItem = { assignment_id: number; enabled: boolean; allowed_levels: string[]; approved_by: string }
type ChildSetting = { child_id: number; enabled: boolean; learning_level: string | null; weekly_limit: number }
type WeekAssignment = { child_id: number; assignment_id: number; assignment_origin?: string }

const liveHosts = new Set(['juanitahub.vercel.app','juanitahub-jsclc.vercel.app'])
const icons: Record<string,string> = { reading:'📚',writing:'✏️',grammar:'🔤',math:'🧮',typing:'⌨️',general:'🌟' }
function localToday(){
  const d=new Date()
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')
}
function mondayFor(value: string) {
  const d = new Date(value+'T12:00:00')
  d.setDate(d.getDate()-((d.getDay()+6)%7))
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')
}
function nameOf(c: Child){return c.first_name+(c.last_name?' '+c.last_name:'')}
function defaultSetting(id:number): ChildSetting {return { child_id:id,enabled:false,learning_level:null,weekly_limit:2 }}

export default function StaffChoiceBoard() {
  const [session,setSession] = useState<Session|null>(null)
  const [authChecked,setAuthChecked] = useState(false)
  const [profile,setProfile] = useState<StaffProfile|null>(null)
  const [loading,setLoading] = useState(true)
  const [saving,setSaving] = useState(false)
  const [message,setMessage] = useState('')
  const [error,setError] = useState('')
  const [dbAvailable,setDbAvailable] = useState(false)
  const [isProduction,setIsProduction] = useState(false)
  const [children,setChildren] = useState<Child[]>([])
  const [regs,setRegs] = useState<Registration[]>([])
  const [library,setLibrary] = useState<Activity[]>([])
  const [published,setPublished] = useState<BoardItem[]>([])
  const [selectedIds,setSelectedIds] = useState<number[]>([])
  const [settings,setSettings] = useState<Record<number,ChildSetting>>({})
  const [weekly,setWeekly] = useState<WeekAssignment[]>([])
  const [selectedChildId,setSelectedChildId] = useState<number|null>(null)
  const [subjectFilter,setSubjectFilter] = useState('all')
  const [search,setSearch] = useState('')
  const [includeDemos,setIncludeDemos] = useState(false)

  useEffect(()=>{
    setIsProduction(liveHosts.has(window.location.hostname))
    let active=true
    supabase.auth.getSession().then(({data})=>{
      if (!active) return
      setSession(data.session);setAuthChecked(true)
      if (!data.session) setLoading(false)
    }).catch(()=>{if(active){setAuthChecked(true);setLoading(false);setError('Unable to read your staff session. Please reload.')}})
    const {data:listener}=supabase.auth.onAuthStateChange((_e,s)=>{
      if(active){setSession(s);setAuthChecked(true)}
    })
    return ()=>{active=false;listener.subscription.unsubscribe()}
  },[])

  useEffect(()=>{
    if(!session){setProfile(null);return}
    let active=true
    async function load(){
      setLoading(true);setMessage('');setError('');setProfile(null)
      setChildren([]);setRegs([]);setLibrary([]);setWeekly([]);setPublished([]);setSelectedIds([]);setSettings({});setDbAvailable(false)
      try{
        const who=await supabase.from('staff_profiles')
          .select('active,role').eq('user_id',session!.user.id).maybeSingle()
        if(!active)return
        if(who.error)throw who.error
        const p=who.data as StaffProfile|null
        setProfile(p)
        if(!p?.active)return
        const week=mondayFor(localToday())
        const [c,r,a,w,items,studentSettings]=await Promise.all([
          supabase.from('children').select('id,first_name,last_name,is_demo').eq('active',true).order('first_name').order('last_name'),
          supabase.from('child_registrations').select('child_id,grade').eq('status','active'),
          supabase.from('learning_assignments')
            .select('id,title,subject,assignment_type,skill,estimated_minutes,grade_levels,active,difficulty,delivery_format,activity_config')
            .eq('active',true).order('subject').order('title'),
          supabase.from('learning_student_assignments').select('child_id,assignment_id,assignment_origin').eq('week_start',week),
          supabase.from('learning_choice_board_items').select('assignment_id,enabled,allowed_levels,approved_by'),
          supabase.from('learning_choice_board_students').select('child_id,enabled,learning_level,weekly_limit'),
        ])
        if(!active)return
        const problem=c.error||r.error||a.error
        if(problem)throw problem
        setChildren((c.data??[]) as Child[])
        setRegs((r.data??[]) as Registration[])
        setLibrary((a.data??[]) as Activity[])
        setWeekly((w.data??[]) as WeekAssignment[])
        setSelectedChildId(x=>x && (c.data??[]).some(child=>child.id===x)?x:Number(c.data?.[0]?.id||0)||null)
        if(!items.error && !studentSettings.error){
          setDbAvailable(true)
          const rows=(items.data??[]) as BoardItem[]
          setPublished(rows)
          setSelectedIds(rows.filter(row=>row.enabled).map(row=>row.assignment_id))
          const byChild:Record<number,ChildSetting>={}
          for(const row of (studentSettings.data??[]) as ChildSetting[])byChild[row.child_id]=row
          setSettings(byChild)
        }
      }catch(e){if(active)setError(e instanceof Error?e.message:'Could not load the Choice Board editor.')}
      finally{if(active)setLoading(false)}
    }
    void load()
    return ()=>{active=false}
  },[session])

  const activities=useMemo(()=>library.filter(a=>
    ['typing','quiz','writing','reading'].includes(a.assignment_type)
    && ['digital','either'].includes(a.delivery_format)
    && a.activity_config?.experience!=='juanita_quest'
    && a.activity_config?.experience!=='juanita_mini_game'
  ),[library])
  const visibleLibrary=useMemo(()=>activities.filter(a=>
    (subjectFilter==='all'||a.subject===subjectFilter)
    && (a.title+' '+(a.skill||'')).toLowerCase().includes(search.trim().toLowerCase())
  ),[activities,subjectFilter,search])
  const selectedChild=children.find(c=>c.id===selectedChildId)||null
  const setting=selectedChildId?settings[selectedChildId]||defaultSetting(selectedChildId):null
  const currentGrade=selectedChildId?regs.find(r=>r.child_id===selectedChildId)?.grade:null
  const currentLevel=setting?.learning_level||currentGrade||null

  const preview=useMemo<ChoiceBoardData>(()=>{
    const selectedRows=activities.filter(a=>selectedIds.includes(a.id))
    const approved=selectedRows.filter(a=>{
      if(!currentLevel)return false
      const saved=published.find(p=>p.assignment_id===a.id)
      const levels=saved?.allowed_levels?.length?saved.allowed_levels:a.grade_levels
      return levels.length===0||levels.includes(currentLevel)
    })
    const seen=new Set(weekly.filter(row=>row.child_id===selectedChildId).map(row=>row.assignment_id))
    const chosen=weekly.filter(row=>row.child_id===selectedChildId && row.assignment_origin==='student_choice').length
    const choices=approved.filter(a=>!seen.has(a.id))
      .map(({id,title,subject,assignment_type,skill,estimated_minutes})=>({id,title,subject,assignment_type,skill,estimated_minutes}))
    const weeklyLimit=setting?.weekly_limit??2
    return {
      enabled:Boolean(setting?.enabled),learning_level:currentLevel,
      weekly_limit:weeklyLimit, used:chosen, remaining:Math.max(0,weeklyLimit-chosen),choices,
    }
  },[activities,selectedIds,currentLevel,published,weekly,setting,selectedChildId])

  const canSave=isProduction && dbAvailable && !saving && Boolean(profile?.active) && Boolean(session)
  function modifySetting(change:Partial<ChildSetting>){
    if(!selectedChildId)return
    setSettings(prev=>({...prev,[selectedChildId]:{...defaultSetting(selectedChildId),...prev[selectedChildId],...change}}))
    setMessage('')
  }
  function toggleAssignment(id:number){
    setSelectedIds(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id])
    setMessage('')
  }
  function pickStarter(){
    const pool=activities.filter(a=>a.difficulty!=='challenge')
    const chosen:number[]=[]
    for(const subject of ['reading','math','typing','grammar','writing']){
      for(const item of pool.filter(a=>a.subject===subject).slice(0,2))chosen.push(item.id)
    }
    setSelectedIds([...new Set([...selectedIds,...chosen])])
    setMessage('Starter activities selected as a draft. Review them before publishing.')
  }

  async function saveCatalog(){
    if(!canSave||!session)return
    setSaving(true);setError('');setMessage('')
    try {
      const previouslyEnabled=new Set(published.filter(x=>x.enabled).map(x=>x.assignment_id))
      const newItems=selectedIds.filter(id=>!previouslyEnabled.has(id))
      const approved=activities.filter(a=>newItems.includes(a.id)).map(a=>({
        assignment_id:a.id,allowed_levels:a.grade_levels||[],enabled:true,
        approved_by:session.user.id,approved_at:new Date().toISOString(),updated_at:new Date().toISOString(),
      }))
      if(approved.length){
        const result=await supabase.from('learning_choice_board_items').upsert(approved,{onConflict:'assignment_id'})
        if(result.error)throw result.error
      }
      const disabled=published.filter(x=>x.enabled&&!selectedIds.includes(x.assignment_id)).map(x=>x.assignment_id)
      if(disabled.length){
        const result=await supabase.from('learning_choice_board_items').update({enabled:false,updated_at:new Date().toISOString()}).in('assignment_id',disabled)
        if(result.error)throw result.error
      }
      const retained=published.filter(x=>selectedIds.includes(x.assignment_id)&&x.enabled)
      setPublished([...retained,...approved])
      setMessage('Approved library updated. Enabled children can now see these choices after signing in.')
    }catch(e){setError(e instanceof Error?e.message:'Could not save the approved catalog. Refresh before retrying.')}
    finally{setSaving(false)}
  }
  async function saveStudent(){
    if(!canSave||!session||!setting)return
    setSaving(true);setError('');setMessage('')
    try{
      const r=await supabase.from('learning_choice_board_students').upsert({
        child_id:setting.child_id,enabled:setting.enabled,learning_level:setting.learning_level||null,
        weekly_limit:setting.weekly_limit,updated_by:session.user.id,updated_at:new Date().toISOString(),
      },{onConflict:'child_id'})
      if(r.error)throw r.error
      setMessage('Choice Board access updated for '+(selectedChild?.first_name??'this student')+'.')
    }catch(e){setError(e instanceof Error?e.message:'Could not update student Choice Board access.')}
    finally{setSaving(false)}
  }

  if(!authChecked || loading&&!profile)return <main className="main"><section className="card">Opening the Choice Board editor…</section></main>
  if(!session)return <main className="main"><section className="card"><h1>Staff Choice Board</h1><p>Sign in as staff to manage student activity choices.</p><a href="/">Staff sign-in</a></section></main>
  if(!profile?.active)return <main className="main"><section className="card"><h1>Staff Choice Board</h1><p>This workspace requires an active staff account.</p><a href="/learning">Back to Learning</a></section></main>

  return <main className="main jh-choice-admin">
    <header className="jh-choice-admin-hero">
      <div><span className="jh-choice-admin-kicker">Learning Hub · Student independence</span><h1>Staff-Approved Choice Board</h1>
        <p>Choose which existing activities children may pick for extra practice. Recurring work stays scheduled; choices are optional and limited per week.</p></div>
      <a href="/learning/planner" className="ghost">← Smart Weekly Planner</a>
    </header>
    {(!isProduction||!dbAvailable)&&<div className="jh-choice-admin-sandbox" role="status"><strong>Safe preview</strong> — Your selections are temporary. No student assignments or catalog settings can be saved here. The database migration and Student Learning service update must be approved before the Choice Board goes live.</div>}
    {error&&<div className="notice error" role="alert">{error}</div>}
    {message&&<div className="notice" role="status">{message}</div>}
    <section className="card jh-choice-admin-catalog">
      <div className="jh-choice-admin-heading"><div><span className="jh-choice-admin-kicker">Step 1 · Staff approval</span><h2>Choose activities children can pick</h2><p>Only independent interactive work from the current Assignment Library is shown. You choose what is approved.</p></div>
        <strong>{selectedIds.length} selected</strong></div>
      <div className="jh-choice-admin-controls">
        <label className="field"><span>Search activities</span><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a subject or activity…" /></label>
        <label className="field"><span>Subject</span><select value={subjectFilter} onChange={e=>setSubjectFilter(e.target.value)}><option value="all">All subjects</option>{['reading','math','typing','grammar','writing','general'].map(sub=><option value={sub} key={sub}>{sub}</option>)}</select></label>
        <button type="button" className="ghost" onClick={pickStarter}>✨ Suggest starter choices</button>
        <button type="button" className="ghost" onClick={()=>setSelectedIds([])}>Clear draft</button>
      </div>
      <div className="jh-choice-admin-library" role="group" aria-label="Approve independent learning activities">
        {visibleLibrary.slice(0,180).map(item=><label key={item.id} className="jh-choice-admin-assignment">
          <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={()=>toggleAssignment(item.id)} />
          <span aria-hidden="true">{icons[item.subject]??'🌟'}</span>
          <span><strong>{item.title}</strong><small>{item.subject} · {item.difficulty} · Grades {item.grade_levels.length?item.grade_levels.join(', '):'all'}{item.estimated_minutes?' · '+item.estimated_minutes+' min':''}</small></span>
        </label>)}
        {!visibleLibrary.length&&<p>No matching interactive assignments. Clear your search to try again.</p>}
      </div>
      <div className="jh-choice-admin-actions"><span>Saving this list approves or withdraws items for all enabled students. Existing chosen work stays in My Week.</span><button type="button" className="primary" disabled={!canSave} onClick={()=>void saveCatalog()}>{saving?'Saving…':!canSave?'Preview only':'Publish approved choices'}</button></div>
    </section>
    <section className="card jh-choice-admin-students">
      <div className="jh-choice-admin-heading"><div><span className="jh-choice-admin-kicker">Step 2 · Student access</span><h2>Set each child's Choice Board</h2><p>Off by default. Allow up to three extra activities per week, and set a lower learning level when school grade is not appropriate.</p></div></div>
      <label className="jh-choice-admin-check"><input type="checkbox" checked={includeDemos} onChange={e=>setIncludeDemos(e.target.checked)}/>Show demo/test students</label>
      <div className="jh-choice-admin-student-layout">
        <div className="jh-choice-admin-roster" role="group" aria-label="Students">
          {children.filter(c=>includeDemos||!c.is_demo).map(c=><button key={c.id} type="button" className={selectedChildId===c.id?'active':''} onClick={()=>{setSelectedChildId(c.id);setMessage('')}}><span>{c.first_name[0]}</span><strong>{nameOf(c)}{c.is_demo?' · Demo':''}</strong><small>{settings[c.id]?.enabled?'Choice Board enabled':'Not enabled'}</small></button>)}
        </div>
        {selectedChild&&setting&&<div className="jh-choice-admin-student-settings">
          <h3>{nameOf(selectedChild)}</h3>
          <p>Registered grade: <strong>{currentGrade||'Not recorded'}</strong></p>
          <label className="jh-choice-admin-check"><input type="checkbox" checked={setting.enabled} onChange={e=>modifySetting({enabled:e.target.checked})}/><span>Enable optional student choices</span></label>
          <div className="jh-choice-admin-fields">
            <label className="field"><span>Learning level for independent choices</span><select value={setting.learning_level||''} onChange={e=>modifySetting({learning_level:e.target.value||null})}><option value="">Use registered grade</option>{['K','1','2','3','4','5','6','7','8','9'].map(level=><option key={level} value={level}>Level {level}</option>)}</select></label>
            <label className="field"><span>Optional picks each week</span><select value={setting.weekly_limit} onChange={e=>modifySetting({weekly_limit:Number(e.target.value)})}>{[0,1,2,3].map(n=><option key={n} value={n}>{n} optional {n===1?'choice':'choices'}</option>)}</select></label>
          </div>
          <p className="jh-choice-admin-explain">Scheduled typing, other recurring practice, and school homework still appear in Today. These choices never cancel or replace those assignments.</p>
          <button type="button" className="primary" disabled={!canSave} onClick={()=>void saveStudent()}>{saving?'Saving…':!canSave?'Preview only':'Save student access'}</button>
        </div>}
      </div>
    </section>
    <section className="jh-choice-admin-preview">
      <div className="jh-choice-admin-heading"><div><span className="jh-choice-admin-kicker">Step 3 · Preview as student</span><h2>What children will see</h2><p>Filtered by this child's learning level, approved catalog, weekly cap, and work already scheduled.</p></div></div>
      <LearningChoiceBoard board={preview} preview />
      {!preview.enabled&&<div className="jh-choice-admin-disabled-note">Enable the selected child's board above to display their available practice choices.</div>}
    </section>
    <p className="jh-choice-admin-footnote">Changes to a live child’s settings or assignment catalog require deliberate staff publication. No automated background assignments are made here.</p>
  </main>
}
