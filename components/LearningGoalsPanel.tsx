'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type GoalChild = {
  id: number
  first_name: string
  last_name: string | null
  is_demo: boolean
}

type GoalType = 'assignment_completions'|'reading_minutes'|'writing_submissions'|'quiz_consistency'|'typing_accuracy'|'typing_wpm'|'custom'
type GoalStatus = 'active'|'reached'|'approved'|'expired'|'cancelled'

export type LearningGoal = {
  id: number
  child_id: number
  goal_type: GoalType
  title: string
  description: string | null
  start_date: string
  end_date: string
  target_value: number
  target_count: number
  current_value: number
  current_count: number
  reward_points: number
  status: GoalStatus
  config: Record<string, unknown>
  reached_at: string | null
  approved_at: string | null
  created_at: string
}

export type LearningAchievement = {
  id: number
  child_id: number
  achievement_key: string
  title: string
  description: string
  icon: string
  unlocked_at: string
  metadata: Record<string, unknown>
}

type GoalSuggestion = {
  goal_type: Exclude<GoalType,'custom'>
  title: string
  description: string
  target_value: number
  target_count: number
  days: number
  reason: string
  config?: Record<string, unknown>
}

function childName(child: GoalChild) {
  return child.first_name + (child.last_name ? ' ' + child.last_name : '')
}
function localDate() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0,10)
}
function addDays(value: string, days: number) {
  const [y,m,d] = value.split('-').map(Number)
  const date = new Date(y,m-1,d)
  date.setDate(date.getDate()+days)
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')
}
function dateLabel(value: string) {
  return new Date(value+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'})
}
function goalIcon(type: GoalType) {
  if (type==='reading_minutes') return '📖'
  if (type==='writing_submissions') return '✍️'
  if (type==='quiz_consistency') return '🧠'
  if (type==='typing_accuracy' || type==='typing_wpm') return '⌨️'
  if (type==='assignment_completions') return '✅'
  return '🎯'
}
function goalProgress(goal: LearningGoal) {
  const repeated = ['quiz_consistency','typing_accuracy','custom'].includes(goal.goal_type)
  const current = repeated ? Number(goal.current_count) : Number(goal.current_value)
  const target = repeated ? Number(goal.target_count) : Number(goal.target_value)
  return Math.max(0,Math.min(100,target ? Math.round(current/target*100) : 0))
}
function progressLabel(goal: LearningGoal) {
  if (goal.goal_type==='reading_minutes') return Math.round(Number(goal.current_value))+' / '+Math.round(Number(goal.target_value))+' min'
  if (goal.goal_type==='assignment_completions') return Math.round(Number(goal.current_value))+' / '+Math.round(Number(goal.target_value))+' completed'
  if (goal.goal_type==='writing_submissions') return Math.round(Number(goal.current_value))+' / '+Math.round(Number(goal.target_value))+' submitted'
  if (goal.goal_type==='quiz_consistency') return goal.current_count+' / '+goal.target_count+' quizzes at '+Number(goal.target_value).toFixed(0)+'%+'
  if (goal.goal_type==='typing_accuracy') return goal.current_count+' / '+goal.target_count+' activities at '+Number(goal.target_value).toFixed(0)+'%+'
  if (goal.goal_type==='typing_wpm') return Number(goal.current_value).toFixed(1)+' / '+Number(goal.target_value).toFixed(0)+' WPM'
  return goal.current_count+' / '+goal.target_count+' check-ins'
}

export default function LearningGoalsPanel({ children }: { children: GoalChild[] }) {
  const [childId,setChildId] = useState<number|null>(children[0]?.id ?? null)
  const [goals,setGoals] = useState<LearningGoal[]>([])
  const [achievements,setAchievements] = useState<LearningAchievement[]>([])
  const [suggestions,setSuggestions] = useState<GoalSuggestion[]>([])
  const [loading,setLoading] = useState(false)
  const [saving,setSaving] = useState(false)
  const [message,setMessage] = useState('')
  const [customOpen,setCustomOpen] = useState(false)
  const [customTitle,setCustomTitle] = useState('')
  const [customDescription,setCustomDescription] = useState('')
  const [customCount,setCustomCount] = useState('3')
  const [customDays,setCustomDays] = useState('30')

  useEffect(()=>{
    if (!childId && children.length) setChildId(children[0].id)
    else if (childId && !children.some((child)=>child.id===childId)) setChildId(children[0]?.id ?? null)
  },[children,childId])

  useEffect(()=>{ if(childId) void load(childId) },[childId])

  async function load(selected=childId) {
    if(!selected) return
    setLoading(true); setMessage('')
    const [goalResult,achievementResult,suggestionResult] = await Promise.all([
      supabase.rpc('refresh_learning_goals',{p_child_id:selected}),
      supabase.rpc('refresh_learning_achievements',{p_child_id:selected}),
      supabase.rpc('learning_goal_suggestions',{p_child_id:selected}),
    ])
    const error=goalResult.error ?? achievementResult.error ?? suggestionResult.error
    if(error) setMessage(error.message)
    setGoals(((goalResult.data ?? []) as LearningGoal[]).map((goal)=>({
      ...goal,
      target_value:Number(goal.target_value),current_value:Number(goal.current_value),reward_points:Number(goal.reward_points),
    })))
    setAchievements((achievementResult.data ?? []) as LearningAchievement[])
    setSuggestions(Array.isArray(suggestionResult.data) ? suggestionResult.data as GoalSuggestion[] : [])
    window.dispatchEvent(new Event('juanita-learning-review-updated'))
    setLoading(false)
  }

  async function createGoal(suggestion: GoalSuggestion) {
    if(!childId || saving || openGoals.length>=2) return
    setSaving(true); setMessage('')
    const start=localDate()
    const { error }=await supabase.rpc('create_learning_goal',{
      p_child_id:childId,
      p_goal_type:suggestion.goal_type,
      p_title:suggestion.title,
      p_description:suggestion.description,
      p_start_date:start,
      p_end_date:addDays(start,Math.max(1,Number(suggestion.days))-1),
      p_target_value:Number(suggestion.target_value),
      p_target_count:Number(suggestion.target_count || 1),
      p_config:suggestion.config ?? {},
    })
    setSaving(false)
    if(error){setMessage(error.message);return}
    setMessage('Goal added. It will track automatically and is worth +1 point after staff approval.')
    await load(childId)
  }

  async function createCustomGoal() {
    if(!childId || saving || !customTitle.trim() || openGoals.length>=2) return
    const count=Math.max(1,Math.min(50,Math.round(Number(customCount)||1)))
    const days=Math.max(1,Math.min(180,Math.round(Number(customDays)||30)))
    const start=localDate()
    setSaving(true);setMessage('')
    const { error }=await supabase.rpc('create_learning_goal',{
      p_child_id:childId,p_goal_type:'custom',p_title:customTitle.trim(),
      p_description:customDescription.trim()||null,p_start_date:start,p_end_date:addDays(start,days-1),
      p_target_value:count,p_target_count:count,p_config:{},
    })
    setSaving(false)
    if(error){setMessage(error.message);return}
    setCustomTitle('');setCustomDescription('');setCustomCount('3');setCustomDays('30');setCustomOpen(false)
    setMessage('Custom goal added. Staff can add a check-in whenever the student makes qualifying progress.')
    await load(childId)
  }

  async function incrementCustom(goalId:number) {
    if(saving) return
    setSaving(true);setMessage('')
    const { error }=await supabase.rpc('increment_custom_learning_goal',{p_goal_id:goalId})
    setSaving(false)
    if(error){setMessage(error.message);return}
    await load()
  }

  async function approve(goal:LearningGoal) {
    if(saving) return
    setSaving(true);setMessage('')
    const { error }=await supabase.rpc('approve_learning_goal_bonus',{p_goal_id:goal.id})
    setSaving(false)
    if(error){setMessage(error.message);return}
    setMessage(goal.title+' approved — +1 Learning Goal Bonus point was added to Rewards.')
    await load()
  }

  async function cancel(goal:LearningGoal) {
    if(saving) return
    if(!window.confirm('Cancel “'+goal.title+'”? Progress will stay in history, but it will no longer earn the bonus point.')) return
    setSaving(true);setMessage('')
    const { error }=await supabase.from('learning_goals').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',goal.id)
    setSaving(false)
    if(error){setMessage(error.message);return}
    await load()
  }

  const selectedChild=children.find((child)=>child.id===childId) ?? null
  const openGoals=useMemo(()=>goals.filter((goal)=>goal.status==='active'||goal.status==='reached'),[goals])
  const historyGoals=useMemo(()=>goals.filter((goal)=>!['active','reached'].includes(goal.status)).slice(0,8),[goals])
  const openSlots=Math.max(0,2-openGoals.length)

  return (
    <section className="learning-section learning-goals-panel">
      <div className="learning-heading">
        <div><span className="learning-kicker">Motivation with purpose</span><h2>Goals & Achievements</h2><p>Set goals that stretch a student without feeling impossible. Reached goals earn one bonus point only after staff approval; achievements are celebration-only.</p></div>
        <label className="field learning-goal-child"><span>Student</span><select value={childId ?? ''} onChange={(e)=>setChildId(Number(e.target.value))}>{children.map((child)=><option key={child.id} value={child.id}>{childName(child)}{child.is_demo?' • Demo/Test':''}</option>)}</select></label>
      </div>

      <div className="notice learning-goal-rule"><strong>Goal rule:</strong> up to 2 open +1-point goals per student. Accuracy/quiz goals require different assignments, and typing-speed goals also require at least 85% accuracy.</div>
      {message && <div className="notice">{message}</div>}
      {loading && <div className="notice">Refreshing goals and achievements…</div>}

      {selectedChild && <>
        <div className="learning-goal-summary">
          <article><strong>{openGoals.length}/2</strong><span>Open goals</span><small>{openSlots} slot{openSlots===1?'':'s'} available</small></article>
          <article><strong>{openGoals.filter((goal)=>goal.status==='reached').length}</strong><span>Awaiting approval</span><small>Reached +1-point goals</small></article>
          <article><strong>{goals.filter((goal)=>goal.status==='approved').length}</strong><span>Bonus goals earned</span><small>Approved goal points</small></article>
          <article><strong>{achievements.length}</strong><span>Achievements</span><small>Badges, no points</small></article>
        </div>

        <div className="learning-goals-layout">
          <section className="card learning-active-goals">
            <div className="section-heading"><div><h2>{selectedChild.first_name}’s goals</h2><p className="subtle">Progress updates from saved Juanita Hub Learning activity.</p></div><span className="badge">{openGoals.length} open</span></div>
            <div className="learning-goal-list">
              {openGoals.map((goal)=>{
                const progress=goalProgress(goal)
                return <article className={'learning-goal-card '+goal.status} key={goal.id}>
                  <span className="learning-goal-icon">{goalIcon(goal.goal_type)}</span>
                  <div className="learning-goal-copy">
                    <div><strong>{goal.title}</strong><em>{goal.status==='reached'?'Goal reached!':'+1 point'}</em></div>
                    {goal.description && <p>{goal.description}</p>}
                    <div className="learning-goal-progress"><span><i style={{width:progress+'%'}} /></span><strong>{progressLabel(goal)}</strong></div>
                    <small>{dateLabel(goal.start_date)} – {dateLabel(goal.end_date)}</small>
                  </div>
                  <div className="learning-goal-actions">
                    {goal.goal_type==='custom' && goal.status==='active' && <button className="ghost" type="button" disabled={saving} onClick={()=>void incrementCustom(goal.id)}>+ Check-in</button>}
                    {goal.status==='reached' && <button className="primary" type="button" disabled={saving} onClick={()=>void approve(goal)}>Approve +1</button>}
                    {goal.status==='active' && <button className="ghost" type="button" disabled={saving} onClick={()=>void cancel(goal)}>Cancel</button>}
                  </div>
                </article>
              })}
              {openGoals.length===0 && <div className="learning-review-empty"><span>🎯</span><strong>No open goals yet.</strong><p>Choose a suggested goal below or make a custom staff goal.</p></div>}
            </div>
          </section>

          <section className="card learning-achievements-card">
            <div className="section-heading"><div><h2>Achievements</h2><p className="subtle">Permanent milestones that celebrate progress without adding points.</p></div><span className="badge">{achievements.length}</span></div>
            <div className="learning-achievement-grid">
              {achievements.slice(0,9).map((achievement)=><article key={achievement.id}><span>{achievement.icon}</span><strong>{achievement.title}</strong><small>{achievement.description}</small></article>)}
              {achievements.length===0 && <div className="learning-inline-empty">Achievements unlock automatically as Learning history grows.</div>}
            </div>
          </section>
        </div>

        <section className="card learning-goal-suggestions">
          <div className="section-heading"><div><h2>Suggested goals for {selectedChild.first_name}</h2><p className="subtle">Targets are based on recent activity when available, then nudged slightly higher to stay challenging but reachable.</p></div><button className="ghost" type="button" onClick={()=>setCustomOpen((value)=>!value)} disabled={openSlots===0}>{customOpen?'Close custom goal':'＋ Custom goal'}</button></div>
          {openSlots===0 && <div className="notice"><strong>Both goal slots are in use.</strong> Approve, complete, expire, or cancel one before starting another.</div>}

          {customOpen && openSlots>0 && <div className="learning-custom-goal-form">
            <label className="field wide"><span>Goal</span><input value={customTitle} onChange={(e)=>setCustomTitle(e.target.value)} placeholder="Example: Ask for help before giving up" /></label>
            <label className="field wide"><span>What counts?</span><textarea rows={2} value={customDescription} onChange={(e)=>setCustomDescription(e.target.value)} placeholder="Describe the behavior staff should count as progress." /></label>
            <label className="field"><span>Check-ins needed</span><input type="number" min="1" max="50" value={customCount} onChange={(e)=>setCustomCount(e.target.value)} /></label>
            <label className="field"><span>Goal length (days)</span><input type="number" min="1" max="180" value={customDays} onChange={(e)=>setCustomDays(e.target.value)} /></label>
            <button className="primary" type="button" disabled={saving||!customTitle.trim()} onClick={()=>void createCustomGoal()}>Create +1-point goal</button>
          </div>}

          <div className="learning-goal-suggestion-grid">
            {suggestions.map((suggestion)=><article key={suggestion.goal_type}>
              <span className="learning-goal-icon">{goalIcon(suggestion.goal_type)}</span>
              <div><strong>{suggestion.title}</strong><p>{suggestion.description}</p><small>{suggestion.reason}</small></div>
              <button className="ghost" type="button" disabled={saving||openSlots===0} onClick={()=>void createGoal(suggestion)}>Use goal</button>
            </article>)}
          </div>
        </section>

        {historyGoals.length>0 && <section className="card learning-goal-history">
          <div className="section-heading"><div><h2>Goal history</h2><p className="subtle">Completed, expired, and cancelled goals remain here for context.</p></div></div>
          {historyGoals.map((goal)=><div className="summary-row" key={goal.id}><span><strong>{goalIcon(goal.goal_type)} {goal.title}</strong><br/><small className="subtle">{dateLabel(goal.start_date)} – {dateLabel(goal.end_date)}</small></span><span><strong>{goal.status==='approved'?'+1 point earned':goal.status}</strong></span></div>)}
        </section>}
      </>}
    </section>
  )
}
