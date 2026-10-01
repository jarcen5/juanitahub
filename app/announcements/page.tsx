'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Profile={display_name:string;role:'staff'|'admin';active:boolean}
type Announcement={id:number;title:string;body:string;pinned:boolean;active:boolean;starts_on:string;ends_on:string|null;created_by:string;created_at:string;updated_at:string}
type Draft={title:string;body:string;pinned:boolean;starts_on:string;ends_on:string}

function localDate(){const d=new Date();const offset=d.getTimezoneOffset();return new Date(d.getTime()-offset*60_000).toISOString().slice(0,10)}
function blankDraft():Draft{return{title:'',body:'',pinned:false,starts_on:localDate(),ends_on:''}}
function dateLabel(value:string|null){return value?new Date(value+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'No end date'}

export default function AnnouncementsPage(){
  const [session,setSession]=useState<Session|null>(null)
  const [profile,setProfile]=useState<Profile|null>(null)
  const [announcements,setAnnouncements]=useState<Announcement[]>([])
  const [showArchived,setShowArchived]=useState(false)
  const [editingId,setEditingId]=useState<number|null>(null)
  const [draft,setDraft]=useState<Draft>(blankDraft())
  const [saving,setSaving]=useState(false)
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')

  useEffect(()=>{let mounted=true;supabase.auth.getSession().then(({data})=>{if(mounted)setSession(data.session)});const{data:l}=supabase.auth.onAuthStateChange((_e,s)=>{if(mounted)setSession(s)});return()=>{mounted=false;l.subscription.unsubscribe()}},[])
  useEffect(()=>{if(session)void load();else setLoading(false)},[session])

  async function load(){
    if(!session)return
    setLoading(true);setMessage('')
    const [p,a]=await Promise.all([
      supabase.from('staff_profiles').select('display_name,role,active').eq('user_id',session.user.id).maybeSingle(),
      supabase.from('center_announcements').select('id,title,body,pinned,active,starts_on,ends_on,created_by,created_at,updated_at').order('active',{ascending:false}).order('pinned',{ascending:false}).order('created_at',{ascending:false}),
    ])
    setProfile(p.data as Profile|null);setAnnouncements((a.data??[]) as Announcement[])
    setMessage(p.error?.message??a.error?.message??'');setLoading(false)
  }

  const visible=useMemo(()=>announcements.filter((a)=>showArchived?!a.active:a.active),[announcements,showArchived])

  function edit(a:Announcement){
    setEditingId(a.id)
    setDraft({title:a.title,body:a.body,pinned:a.pinned,starts_on:a.starts_on,ends_on:a.ends_on??''})
    setMessage('')
  }
  function reset(){setEditingId(null);setDraft(blankDraft())}

  async function save(){
    if(!session||!profile?.active||saving)return
    if(!draft.title.trim()||!draft.body.trim()){setMessage('Add both a title and announcement message.');return}
    if(draft.ends_on&&draft.ends_on<draft.starts_on){setMessage('The end date cannot be before the start date.');return}
    setSaving(true);setMessage('')
    const row={title:draft.title.trim(),body:draft.body.trim(),pinned:draft.pinned,starts_on:draft.starts_on,ends_on:draft.ends_on||null,updated_by:session.user.id}
    const result=editingId
      ? await supabase.from('center_announcements').update(row).eq('id',editingId)
      : await supabase.from('center_announcements').insert({...row,created_by:session.user.id})
    setSaving(false)
    if(result.error){setMessage(result.error.message);return}
    setMessage(editingId?'Announcement updated.':'Announcement posted to the staff dashboard.')
    reset();await load()
  }

  async function setActive(a:Announcement,active:boolean){
    if(!session||!profile?.active||saving)return
    setSaving(true)
    const {error}=await supabase.from('center_announcements').update({active,updated_by:session.user.id}).eq('id',a.id)
    setSaving(false)
    if(error){setMessage(error.message);return}
    if(editingId===a.id)reset()
    setMessage(active?'Announcement restored.':'Announcement archived.')
    await load()
  }

  if(loading&&!session)return <main className="login-wrap"><div className="card login-card">Loading announcements…</div></main>
  if(!session)return <main className="login-wrap"><section className="card login-card"><h1>Announcements</h1><p className="subtle">Sign in through Juanita Hub first.</p></section></main>
  if(!profile?.active)return <main className="login-wrap"><section className="card login-card"><h1>Announcements</h1><div className="notice">Your staff account must be active.</div></section></main>

  return <div className="shell"><header className="topbar"><div className="brand">Juanita Hub<small>Staff Announcements</small></div><div className="toolbar"><span>{profile.display_name} <span className="badge">{profile.role}</span></span></div></header>
    <main className="main announcements-page">
      <section className="hero announcements-hero"><div><span className="programs-eyebrow">Programs & calendar</span><h1>Announcement Board</h1><p className="subtle">Post short reminders for staff. Active announcements appear automatically on the Juanita Hub home dashboard.</p></div></section>
      {message&&<div className="notice">{message}</div>}

      <section className="announcements-layout">
        <section className="card announcement-editor">
          <div className="announcement-section-heading"><div><small>{editingId?'Editing':'New post'}</small><h2>{editingId?'Edit announcement':'Post an announcement'}</h2></div>{editingId&&<button className="ghost compact-button" onClick={reset}>Cancel edit</button>}</div>
          <label className="field"><span>Title</span><input value={draft.title} onChange={(e)=>setDraft((d)=>({...d,title:e.target.value}))} placeholder="Reminder for tomorrow" /></label>
          <label className="field"><span>Message</span><textarea rows={5} value={draft.body} onChange={(e)=>setDraft((d)=>({...d,body:e.target.value}))} placeholder="What does the team need to know?" /></label>
          <div className="announcement-date-grid"><label className="field"><span>Show starting</span><input type="date" value={draft.starts_on} onChange={(e)=>setDraft((d)=>({...d,starts_on:e.target.value}))} /></label><label className="field"><span>Stop showing (optional)</span><input type="date" min={draft.starts_on} value={draft.ends_on} onChange={(e)=>setDraft((d)=>({...d,ends_on:e.target.value}))} /></label></div>
          <label className="announcement-pin"><input type="checkbox" checked={draft.pinned} onChange={(e)=>setDraft((d)=>({...d,pinned:e.target.checked}))}/><span><strong>Pin this announcement</strong><small>Pinned reminders appear first on the dashboard.</small></span></label>
          <button className="primary" disabled={saving||!draft.title.trim()||!draft.body.trim()} onClick={()=>void save()}>{saving?'Saving…':editingId?'Save changes':'Post announcement'}</button>
        </section>

        <section className="card announcement-list-card">
          <div className="announcement-section-heading"><div><small>Staff board</small><h2>{showArchived?'Archived':'Active'} announcements</h2></div><button className="ghost compact-button" onClick={()=>setShowArchived((v)=>!v)}>{showArchived?'Show active':'Show archived'}</button></div>
          <div className="announcement-list">
            {visible.map((a)=><article key={a.id} className={a.pinned?'pinned':''}><span className="announcement-icon">{a.pinned?'📌':'💬'}</span><div className="announcement-copy"><strong>{a.title}</strong><p>{a.body}</p><small>{dateLabel(a.starts_on)} → {dateLabel(a.ends_on)}{!a.active?' • Archived':''}</small></div><div className="announcement-actions"><button className="ghost compact-button" onClick={()=>edit(a)}>Edit</button><button className="ghost compact-button" onClick={()=>void setActive(a,!a.active)}>{a.active?'Archive':'Restore'}</button></div></article>)}
            {visible.length===0&&<div className="home-empty-state">{showArchived?'No archived announcements.':'No active announcements yet.'}</div>}
          </div>
        </section>
      </section>
    </main>
  </div>
}
