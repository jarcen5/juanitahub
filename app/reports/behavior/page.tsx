'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import HistoryEntryList from '@/components/HistoryEntryList'
import { supabase } from '@/lib/supabase'

type CardName='diamond'|'green'|'yellow'|'orange'|'red'
type Child={id:number;first_name:string;last_name:string|null;active:boolean;is_demo:boolean}
type Entry={id:number;child_id:number;entry_date:string;entry_type:'behavior'|'status';card:CardName|null;day_status:string|null;points:number;note:string|null;recorded_by:string}
type GoalBonus={id:number;child_id:number;points:number;awarded_on:string;note:string|null}
type Profile={display_name:string;role:'staff'|'admin';active:boolean}
type Settings={wheel_rule_mode:'pending'|'points_per_spin'|'tiers';points_per_spin:number|null}
type View='summary'|'history'

function currentMonthKey(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function monthBounds(key:string){const [y,m]=key.split('-').map(Number);const end=new Date(y,m,0);return{start:key+'-01',end:[end.getFullYear(),String(end.getMonth()+1).padStart(2,'0'),String(end.getDate()).padStart(2,'0')].join('-')}}
function monthLabel(key:string){const [y,m]=key.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString(undefined,{month:'long',year:'numeric'})}
function shiftMonth(key:string,delta:number){const [y,m]=key.split('-').map(Number);const d=new Date(y,m-1+delta,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function childName(c:Child){return c.first_name+(c.last_name?' '+c.last_name:'')}
function pretty(value:string|null){return value?value.replaceAll('_',' ').replace(/\b\w/g,(c)=>c.toUpperCase()):'—'}
function points(value:number){return (value>0?'+':'')+Number(value).toFixed(Number.isInteger(value)?0:1)}

export default function BehaviorReportsPage(){
  const [session,setSession]=useState<Session|null>(null)
  const [profile,setProfile]=useState<Profile|null>(null)
  const [children,setChildren]=useState<Child[]>([])
  const [entries,setEntries]=useState<Entry[]>([])
  const [bonuses,setBonuses]=useState<GoalBonus[]>([])
  const [settings,setSettings]=useState<Settings|null>(null)
  const [month,setMonth]=useState(currentMonthKey())
  const [view,setView]=useState<View>('summary')
  const [childId,setChildId]=useState<number|null>(null)
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')

  useEffect(()=>{let mounted=true;supabase.auth.getSession().then(({data})=>{if(mounted)setSession(data.session)});const{data:l}=supabase.auth.onAuthStateChange((_e,s)=>{if(mounted)setSession(s)});return()=>{mounted=false;l.subscription.unsubscribe()}},[])
  useEffect(()=>{if(session)void load()},[session,month])
  useEffect(()=>{if(typeof window==='undefined')return;const requested=Number(new URLSearchParams(window.location.search).get('child'));if(Number.isFinite(requested)){setChildId(requested);setView('history')}},[])

  async function load(){
    if(!session)return
    setLoading(true);setMessage('')
    const bounds=monthBounds(month)
    const [p,c,e,b,s]=await Promise.all([
      supabase.from('staff_profiles').select('display_name,role,active').eq('user_id',session.user.id).maybeSingle(),
      supabase.from('children').select('id,first_name,last_name,active,is_demo').order('first_name').order('last_name'),
      supabase.from('behavior_entries').select('id,child_id,entry_date,entry_type,card,day_status,points,note,recorded_by').gte('entry_date',bounds.start).lte('entry_date',bounds.end).order('entry_date',{ascending:false}),
      supabase.from('learning_goal_bonus_points').select('id,child_id,points,awarded_on,note').gte('awarded_on',bounds.start).lte('awarded_on',bounds.end).order('awarded_on',{ascending:false}),
      supabase.from('app_settings').select('wheel_rule_mode,points_per_spin').eq('id',1).maybeSingle(),
    ])
    setProfile(p.data as Profile|null);setChildren((c.data??[]) as Child[])
    setEntries(((e.data??[]) as any[]).map((r)=>({...r,points:Number(r.points||0)})) as Entry[])
    setBonuses(((b.data??[]) as any[]).map((r)=>({...r,points:Number(r.points||0)})) as GoalBonus[])
    setSettings(s.data as Settings|null)
    setMessage(p.error?.message??c.error?.message??e.error?.message??b.error?.message??s.error?.message??'')
    setLoading(false)
  }

  const realChildren=useMemo(()=>children.filter((c)=>!c.is_demo),[children])
  const realIds=useMemo(()=>new Set(realChildren.map((c)=>c.id)),[realChildren])
  const realEntries=useMemo(()=>entries.filter((e)=>realIds.has(e.child_id)),[entries,realIds])
  const realBonuses=useMemo(()=>bonuses.filter((b)=>realIds.has(b.child_id)),[bonuses,realIds])
  const summaryChildren=useMemo(()=>{const ids=new Set(realEntries.map((e)=>e.child_id));return realChildren.filter((c)=>c.active||ids.has(c.id))},[realChildren,realEntries])
  const spinsFor=(value:number,diamonds:number)=>settings?.wheel_rule_mode==='points_per_spin'&&Number(settings.points_per_spin)>0?Math.max(0,Math.round(value/Number(settings.points_per_spin)))+diamonds:null
  const summaries=useMemo(()=>summaryChildren.map((c)=>{const ce=realEntries.filter((e)=>e.child_id===c.id);const cb=realBonuses.filter((b)=>b.child_id===c.id);const behavior=ce.reduce((s,e)=>s+e.points,0);const bonus=cb.reduce((s,b)=>s+b.points,0);const diamonds=ce.filter((e)=>e.card==='diamond').length;return{...c,entries:ce.length,behavior,bonus,total:behavior+bonus,diamonds,spins:spinsFor(behavior+bonus,diamonds)}}),[summaryChildren,realEntries,realBonuses,settings])
  const selected=children.find((c)=>c.id===childId)??null
  const selectedEntries=entries.filter((e)=>e.child_id===childId)
  const selectedBonuses=bonuses.filter((b)=>b.child_id===childId)
  const selectedPoints=selectedEntries.reduce((s,e)=>s+e.points,0)+selectedBonuses.reduce((s,b)=>s+b.points,0)
  const selectedDiamonds=selectedEntries.filter((e)=>e.card==='diamond').length
  const selectedSpins=spinsFor(selectedPoints,selectedDiamonds)

  if(loading&&!session)return <main className="login-wrap"><div className="card login-card">Loading behavior reports…</div></main>
  if(!session)return <main className="login-wrap"><section className="card login-card"><h1>Behavior Reports</h1><p className="subtle">Sign in through Juanita Hub first.</p></section></main>
  if(!profile?.active)return <main className="login-wrap"><section className="card login-card"><h1>Behavior Reports</h1><div className="notice">Your staff account must be active.</div></section></main>

  return <div className="shell"><header className="topbar"><div className="brand">Juanita Hub<small>Behavior Reports</small></div><div className="toolbar"><span>{profile.display_name} <span className="badge">{profile.role}</span></span></div></header>
    <main className="main">
      <section className="hero"><div><span className="children-eyebrow">Reports</span><h1>Behavior Summary & History</h1><p className="subtle">Monthly behavior data lives here; the Behavior workspace stays focused on today.</p></div><a className="primary" href="/card-tracking" style={{textDecoration:'none'}}>Open Today’s Behavior</a></section>
      {message&&<div className="notice">{message}</div>}
      <section className="month-bar card"><div><span className="subtle month-label">Viewing month</span><strong>{monthLabel(month)}</strong></div><div className="toolbar"><button className="ghost compact-button" onClick={()=>setMonth(shiftMonth(month,-1))}>← Previous</button><input type="month" value={month} max={currentMonthKey()} onChange={(e)=>e.target.value&&setMonth(e.target.value)} /><button className="ghost compact-button" disabled={month===currentMonthKey()} onClick={()=>setMonth(shiftMonth(month,1))}>Next →</button></div></section>
      <nav className="nav"><button className={view==='summary'?'active':''} onClick={()=>setView('summary')}>Monthly Summary</button><button className={view==='history'?'active':''} onClick={()=>setView('history')}>Child History</button></nav>

      {view==='summary'&&<section className="grid panel-grid">
        <div className="card"><h2>Points & spins by child</h2><p className="subtle">{monthLabel(month)}. Archived students remain visible when they have records in this month.</p>
          {summaries.map((c)=><button className="summary-row clickable-row" key={c.id} onClick={()=>{setChildId(c.id);setView('history')}}><span><strong>{childName(c)}</strong>{!c.active&&<span className="badge archived-badge">Archived</span>}<br/><span className="subtle" style={{fontSize:13}}>{c.entries} recorded {c.entries===1?'day':'days'}{c.bonus>0?` • +${c.bonus} Learning Goal bonus`:''}</span></span><span className="summary-actions"><strong>{points(c.total)} pts • {c.spins==null?'Spins pending':c.spins+' spin'+(c.spins===1?'':'s')}</strong><span className="history-link">View history →</span></span></button>)}
          {summaries.length===0&&<div className="empty">No behavior records for this month.</div>}
        </div>
        <div className="card"><h2>Card totals</h2>
          {['diamond','green','yellow','orange','red'].map((card)=><div className="summary-row" key={card}><span>{pretty(card)}</span><strong>{realEntries.filter((e)=>e.card===card).length}</strong></div>)}
          <div className="summary-row"><span>Statuses / non-behavior days</span><strong>{realEntries.filter((e)=>e.entry_type==='status').length}</strong></div>
          <div className="summary-row"><span>🎯 Learning Goal bonus points</span><strong>+{realBonuses.reduce((s,b)=>s+b.points,0)}</strong></div>
        </div>
      </section>}

      {view==='history'&&<section className="history-layout">
        <aside className="card history-sidebar"><h2>Choose child</h2><div className="field" style={{marginBottom:0}}><select value={childId??''} onChange={(e)=>setChildId(Number(e.target.value))}><option value="" disabled>Select a child…</option>{children.map((c)=><option key={c.id} value={c.id}>{childName(c)}{c.active?'':' (Archived)'}</option>)}</select></div>
          {selected&&<div className="history-mini-stats"><div><span className="subtle">Points</span><strong>{points(selectedPoints)}</strong></div><div><span className="subtle">Spins</span><strong>{selectedSpins==null?'Pending':selectedSpins}</strong></div><div><span className="subtle">Diamonds</span><strong>{selectedDiamonds}</strong></div><div><span className="subtle">Entries</span><strong>{selectedEntries.length}</strong></div></div>}
        </aside>
        <div className="card history-panel">{selected?<><div className="history-heading"><div><h2>{childName(selected)} {!selected.active&&<span className="badge archived-badge">Archived</span>}</h2><p className="subtle">{monthLabel(month)} behavior history</p></div><a className="ghost" href={'/children?child='+selected.id} style={{textDecoration:'none'}}>Open student profile</a></div>
          {selectedEntries.length===0&&selectedBonuses.length===0?<div className="empty">No entries for {childName(selected)} in {monthLabel(month)}.</div>:<>{selectedEntries.length>0&&<HistoryEntryList entries={selectedEntries} onSaved={load}/>} {selectedBonuses.length>0&&<div className="learning-bonus-history"><h3>Learning Goal bonuses</h3>{selectedBonuses.map((b)=><div className="summary-row" key={b.id}><span><strong>🎯 {b.note||'Learning Goal Bonus'}</strong><br/><small className="subtle">{new Date(b.awarded_on+'T12:00:00').toLocaleDateString()}</small></span><strong>+{b.points} pt</strong></div>)}</div>}</>}</>:<div className="empty">Choose a child to view their history.</div>}</div>
      </section>}
    </main></div>
}
