'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Mode = 'behavior' | 'rewards'
type BehaviorEntry = { id:number; entry_date:string; entry_type:'behavior'|'status'; card:string|null; day_status:string|null; points:number; note:string|null }
type RewardWin = { id:number; source:'monthly'|'free'; prize_name:string; category_name:string; tier_name:string; reason:string|null; won_at:string; received_at:string|null }

function localDate(date=new Date()){const offset=date.getTimezoneOffset();return new Date(date.getTime()-offset*60_000).toISOString().slice(0,10)}
function sixMonthsAgo(){const now=new Date();now.setMonth(now.getMonth()-6);return localDate(now)}
function pretty(value:string|null){return value ? value.replaceAll('_',' ').replace(/\b\w/g,(c)=>c.toUpperCase()) : '—'}
function shortDate(value:string){return new Date(value.includes('T')?value:value+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}

export default function ChildActivitySnapshot({mode,childId,childName}:{mode:Mode;childId:number;childName:string}){
  const [behavior,setBehavior]=useState<BehaviorEntry[]>([])
  const [rewards,setRewards]=useState<RewardWin[]>([])
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')

  useEffect(()=>{void load()},[childId,mode])

  async function load(){
    setLoading(true);setMessage('')
    const start=sixMonthsAgo()
    if(mode==='behavior'){
      const {data,error}=await supabase.from('behavior_entries').select('id,entry_date,entry_type,card,day_status,points,note').eq('child_id',childId).gte('entry_date',start).order('entry_date',{ascending:false})
      if(error)setMessage(error.message)
      setBehavior(((data??[]) as any[]).map((row)=>({...row,points:Number(row.points||0)})) as BehaviorEntry[])
    }else{
      const startIso=start+'T00:00:00'
      const [monthly,free]=await Promise.all([
        supabase.from('prize_wins').select('id,prize_name_snapshot,category_name_snapshot,tier_name_snapshot,won_at,received_at').eq('child_id',childId).gte('won_at',startIso).order('won_at',{ascending:false}),
        supabase.from('free_prize_wins').select('id,prize_name_snapshot,category_name_snapshot,tier_name_snapshot,reason,won_at,received_at').eq('child_id',childId).gte('won_at',startIso).order('won_at',{ascending:false}),
      ])
      const error=monthly.error??free.error
      if(error)setMessage(error.message)
      const rows:RewardWin[]=[
        ...((monthly.data??[]) as any[]).map((row)=>({id:row.id,source:'monthly' as const,prize_name:row.prize_name_snapshot,category_name:row.category_name_snapshot,tier_name:row.tier_name_snapshot,reason:null,won_at:row.won_at,received_at:row.received_at})),
        ...((free.data??[]) as any[]).map((row)=>({id:row.id,source:'free' as const,prize_name:row.prize_name_snapshot,category_name:row.category_name_snapshot,tier_name:row.tier_name_snapshot,reason:row.reason,won_at:row.won_at,received_at:row.received_at})),
      ].sort((a,b)=>b.won_at.localeCompare(a.won_at))
      setRewards(rows)
    }
    setLoading(false)
  }

  const behaviorStats=useMemo(()=>{
    const cards=behavior.filter((row)=>row.entry_type==='behavior'&&row.card)
    const counts=new Map<string,number>()
    cards.forEach((row)=>counts.set(row.card!, (counts.get(row.card!)??0)+1))
    const positive=cards.filter((row)=>row.card==='diamond'||row.card==='green').length
    return {
      days:behavior.length,
      cardDays:cards.length,
      points:behavior.reduce((sum,row)=>sum+Number(row.points||0),0),
      positive,
      notes:behavior.filter((row)=>row.note?.trim()).length,
      counts,
    }
  },[behavior])

  if(loading)return <div className="children-empty-inline">Loading six-month {mode} snapshot…</div>

  if(mode==='behavior'){
    const recent=behavior.slice(0,6)
    return <section className="child-activity-snapshot">
      <div className="child-activity-heading"><div><span className="children-eyebrow">Last 6 months</span><h3>{childName} • Behavior</h3><p>Quick synopsis of daily behavior cards, statuses, points, and notes.</p></div><Link className="ghost" href={'/reports/behavior?child='+childId}>Open behavior report</Link></div>
      {message&&<div className="notice">{message}</div>}
      <div className="child-activity-metrics">
        <article><small>Recorded days</small><strong>{behaviorStats.days}</strong><span>{behaviorStats.cardDays} behavior-card days</span></article>
        <article><small>Behavior points</small><strong>{behaviorStats.points>0?'+':''}{behaviorStats.points}</strong><span>Six-month total</span></article>
        <article><small>Green / Diamond</small><strong>{behaviorStats.cardDays?Math.round(behaviorStats.positive/behaviorStats.cardDays*100)+'%':'—'}</strong><span>{behaviorStats.positive} positive card days</span></article>
        <article><small>Notes</small><strong>{behaviorStats.notes}</strong><span>Days with staff notes</span></article>
      </div>
      <div className="child-card-breakdown">
        {['diamond','green','yellow','orange','red'].map((card)=><span key={card}>{pretty(card)} • {behaviorStats.counts.get(card)??0}</span>)}
        <span>Statuses • {behavior.filter((row)=>row.entry_type==='status').length}</span>
      </div>
      <div className="child-activity-list">
        {recent.map((row)=><article key={row.id}><span><strong>{row.entry_type==='behavior'?pretty(row.card)+' card':pretty(row.day_status)}</strong><small>{shortDate(row.entry_date)}</small></span><em>{row.entry_type==='behavior'?(row.points>0?'+':'')+row.points+' pts':'Status'}</em>{row.note&&<p className="child-activity-note">{row.note}</p>}</article>)}
        {recent.length===0&&<div className="children-empty-inline">No behavior records in the last six months.</div>}
      </div>
    </section>
  }

  const received=rewards.filter((row)=>row.received_at).length
  const pending=rewards.length-received
  return <section className="child-activity-snapshot">
    <div className="child-activity-heading"><div><span className="children-eyebrow">Last 6 months</span><h3>{childName} • Rewards</h3><p>Monthly-wheel and free-spin prizes received during this period.</p></div><Link className="ghost" href="/rewards#fulfillment">Open Reward Center</Link></div>
    {message&&<div className="notice">{message}</div>}
    <div className="child-activity-metrics">
      <article><small>Prizes won</small><strong>{rewards.length}</strong><span>Monthly + free prizes</span></article>
      <article><small>Received</small><strong>{received}</strong><span>Marked fulfilled</span></article>
      <article><small>Waiting</small><strong>{pending}</strong><span>Still needs fulfillment</span></article>
      <article><small>Free prizes</small><strong>{rewards.filter((row)=>row.source==='free').length}</strong><span>Free-spin wins</span></article>
    </div>
    <div className="child-activity-list">
      {rewards.slice(0,8).map((row)=><article key={row.source+'-'+row.id}><span><strong>{row.prize_name}</strong><small>{row.category_name} • {row.tier_name} • {shortDate(row.won_at)}</small></span><em>{row.received_at?'Received':'Waiting'}</em>{row.reason&&<p className="child-activity-note">{row.reason}</p>}</article>)}
      {rewards.length===0&&<div className="children-empty-inline">No prizes recorded in the last six months.</div>}
    </div>
  </section>
}
