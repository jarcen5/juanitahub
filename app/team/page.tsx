'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type AccessProfile = {
  display_name: string
  role: 'staff' | 'admin'
  active: boolean
}

type MemberType = 'staff' | 'intern' | 'volunteer'
type TeamMember = {
  id: number
  staff_user_id: string | null
  display_name: string
  member_type: MemberType
  title: string | null
  active: boolean
  supervisor_member_id: number | null
  start_date: string | null
  end_date: string | null
}

type Program = {
  id: number
  name: string
  season_label: string | null
  status: string
  location: string | null
}

type ProgramAssignment = {
  id: number
  team_member_id: number
  program_id: number
  assignment_role: string | null
  starts_on: string | null
  ends_on: string | null
  active: boolean
}

type ScheduleBlock = {
  id: number
  team_member_id: number
  day_of_week: number
  block_type: 'shift' | 'available'
  start_time: string
  end_time: string
  program_id: number | null
  location: string | null
  notes: string | null
  effective_start: string | null
  effective_end: string | null
}

type ScheduleException = {
  id: number
  team_member_id: number
  exception_date: string
  exception_type: 'off' | 'modified'
  start_time: string | null
  end_time: string | null
  note: string | null
}

const days = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
]

function timeLabel(value: string | null) {
  if (!value) return ''
  const [hour, minute] = value.slice(0, 5).split(':').map(Number)
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function dateLabel(value: string | null) {
  if (!value) return 'Open-ended'
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function memberTypeLabel(type: MemberType) {
  if (type === 'intern') return 'Intern'
  if (type === 'volunteer') return 'Volunteer'
  return 'Staff'
}

export default function TeamPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<AccessProfile | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [assignments, setAssignments] = useState<ProgramAssignment[]>([])
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [exceptions, setExceptions] = useState<ScheduleException[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [tab, setTab] = useState<'team' | 'schedule' | 'programs'>('team')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const [memberName, setMemberName] = useState('')
  const [memberType, setMemberType] = useState<MemberType>('intern')
  const [memberTitle, setMemberTitle] = useState('')
  const [memberSupervisor, setMemberSupervisor] = useState('')
  const [memberStart, setMemberStart] = useState('')
  const [memberEnd, setMemberEnd] = useState('')
  const [memberActive, setMemberActive] = useState(true)

  const [blockDay, setBlockDay] = useState('1')
  const [blockType, setBlockType] = useState<'shift' | 'available'>('shift')
  const [blockStart, setBlockStart] = useState('14:00')
  const [blockEnd, setBlockEnd] = useState('18:00')
  const [blockProgram, setBlockProgram] = useState('')
  const [blockLocation, setBlockLocation] = useState('')
  const [blockNotes, setBlockNotes] = useState('')
  const [blockEffectiveStart, setBlockEffectiveStart] = useState('')
  const [blockEffectiveEnd, setBlockEffectiveEnd] = useState('')

  const [exceptionDate, setExceptionDate] = useState('')
  const [exceptionType, setExceptionType] = useState<'off' | 'modified'>('off')
  const [exceptionStart, setExceptionStart] = useState('')
  const [exceptionEnd, setExceptionEnd] = useState('')
  const [exceptionNote, setExceptionNote] = useState('')

  const [assignmentProgram, setAssignmentProgram] = useState('')
  const [assignmentRole, setAssignmentRole] = useState('')
  const [assignmentStart, setAssignmentStart] = useState('')
  const [assignmentEnd, setAssignmentEnd] = useState('')

  useEffect(() => {
    let mounted = true
    void supabase.auth.getSession().then(({ data }) => { if (mounted) setSession(data.session) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { if (mounted) setSession(next) })
    return () => { mounted = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (session) void loadData()
    else setLoading(false)
  }, [session])

  async function loadData() {
    if (!session) return
    setLoading(true)

    const profileResult = await supabase
      .from('staff_profiles')
      .select('display_name,role,active')
      .eq('user_id', session.user.id)
      .maybeSingle()

    const currentProfile = profileResult.data as AccessProfile | null
    setProfile(currentProfile)

    if (!currentProfile?.active) {
      setLoading(false)
      return
    }

    const [memberResult, programResult, assignmentResult, blockResult, exceptionResult] = await Promise.all([
      supabase.from('team_members').select('id,staff_user_id,display_name,member_type,title,active,supervisor_member_id,start_date,end_date').order('active', { ascending: false }).order('display_name'),
      supabase.from('programs').select('id,name,season_label,status,location').order('name'),
      supabase.from('team_program_assignments').select('id,team_member_id,program_id,assignment_role,starts_on,ends_on,active').order('created_at'),
      supabase.from('team_schedule_blocks').select('id,team_member_id,day_of_week,block_type,start_time,end_time,program_id,location,notes,effective_start,effective_end').order('day_of_week').order('start_time'),
      supabase.from('team_schedule_exceptions').select('id,team_member_id,exception_date,exception_type,start_time,end_time,note').order('exception_date'),
    ])

    const nextMembers = (memberResult.data ?? []) as TeamMember[]
    setMembers(nextMembers)
    setPrograms((programResult.data ?? []) as Program[])
    setAssignments((assignmentResult.data ?? []) as ProgramAssignment[])
    setBlocks((blockResult.data ?? []) as ScheduleBlock[])
    setExceptions((exceptionResult.data ?? []) as ScheduleException[])

    setSelectedId((current) => current && nextMembers.some((member) => member.id === current)
      ? current
      : nextMembers.find((member) => member.active)?.id ?? nextMembers[0]?.id ?? null)

    setMessage(
      profileResult.error?.message
      ?? memberResult.error?.message
      ?? programResult.error?.message
      ?? assignmentResult.error?.message
      ?? blockResult.error?.message
      ?? exceptionResult.error?.message
      ?? '',
    )
    setLoading(false)
  }

  const selectedMember = members.find((member) => member.id === selectedId) ?? null
  const memberMap = useMemo(() => new Map(members.map((member) => [member.id, member])), [members])
  const programMap = useMemo(() => new Map(programs.map((program) => [program.id, program])), [programs])
  const selectedBlocks = useMemo(() => blocks.filter((block) => block.team_member_id === selectedId), [blocks, selectedId])
  const selectedExceptions = useMemo(() => exceptions.filter((item) => item.team_member_id === selectedId), [exceptions, selectedId])
  const selectedAssignments = useMemo(() => assignments.filter((item) => item.team_member_id === selectedId), [assignments, selectedId])

  useEffect(() => {
    if (!selectedMember) {
      resetMemberForm()
      return
    }
    setMemberName(selectedMember.display_name)
    setMemberType(selectedMember.member_type)
    setMemberTitle(selectedMember.title ?? '')
    setMemberSupervisor(selectedMember.supervisor_member_id ? String(selectedMember.supervisor_member_id) : '')
    setMemberStart(selectedMember.start_date ?? '')
    setMemberEnd(selectedMember.end_date ?? '')
    setMemberActive(selectedMember.active)
  }, [selectedId])

  function resetMemberForm() {
    setMemberName('')
    setMemberType('intern')
    setMemberTitle('')
    setMemberSupervisor('')
    setMemberStart('')
    setMemberEnd('')
    setMemberActive(true)
  }

  function newMember() {
    setSelectedId(null)
    resetMemberForm()
    setTab('team')
  }

  async function saveMember() {
    if (!session || profile?.role !== 'admin' || saving || !memberName.trim()) return
    if (memberEnd && memberStart && memberEnd < memberStart) {
      setMessage('The end date cannot be earlier than the start date.')
      return
    }

    setSaving(true)
    setMessage('')
    const payload = {
      display_name: memberName.trim(),
      member_type: memberType,
      title: memberTitle.trim() || null,
      supervisor_member_id: memberSupervisor ? Number(memberSupervisor) : null,
      start_date: memberStart || null,
      end_date: memberEnd || null,
      active: memberActive,
      updated_by: session.user.id,
    }

    if (selectedMember) {
      const { error } = await supabase.from('team_members').update(payload).eq('id', selectedMember.id)
      if (error) setMessage(error.message)
      else {
        setMessage('Team profile updated.')
        await loadData()
      }
    } else {
      const { data, error } = await supabase
        .from('team_members')
        .insert({ ...payload, created_by: session.user.id })
        .select('id')
        .single()

      if (error) setMessage(error.message)
      else {
        setMessage('Team member added.')
        await loadData()
        if (data?.id) setSelectedId(data.id)
      }
    }
    setSaving(false)
  }

  async function addScheduleBlock() {
    if (!session || profile?.role !== 'admin' || !selectedMember || saving) return
    if (!blockStart || !blockEnd || blockEnd <= blockStart) {
      setMessage('Choose a schedule end time later than the start time.')
      return
    }
    if (blockEffectiveEnd && blockEffectiveStart && blockEffectiveEnd < blockEffectiveStart) {
      setMessage('The schedule effective end date cannot be before its start date.')
      return
    }

    setSaving(true)
    setMessage('')
    const { error } = await supabase.from('team_schedule_blocks').insert({
      team_member_id: selectedMember.id,
      day_of_week: Number(blockDay),
      block_type: blockType,
      start_time: blockStart,
      end_time: blockEnd,
      program_id: blockProgram ? Number(blockProgram) : null,
      location: blockLocation.trim() || null,
      notes: blockNotes.trim() || null,
      effective_start: blockEffectiveStart || null,
      effective_end: blockEffectiveEnd || null,
      created_by: session.user.id,
    })
    if (error) setMessage(error.message)
    else {
      setBlockNotes('')
      setMessage('Weekly schedule block added.')
      await loadData()
    }
    setSaving(false)
  }

  async function removeScheduleBlock(id: number) {
    if (profile?.role !== 'admin' || saving) return
    setSaving(true)
    const { error } = await supabase.from('team_schedule_blocks').delete().eq('id', id)
    if (error) setMessage(error.message)
    else {
      setMessage('Schedule block removed.')
      setBlocks((current) => current.filter((item) => item.id !== id))
    }
    setSaving(false)
  }

  async function saveException() {
    if (!session || profile?.role !== 'admin' || !selectedMember || saving || !exceptionDate) return
    if (exceptionType === 'modified' && (!exceptionStart || !exceptionEnd || exceptionEnd <= exceptionStart)) {
      setMessage('For a modified day, choose an end time later than the start time.')
      return
    }

    setSaving(true)
    setMessage('')
    const { error } = await supabase.from('team_schedule_exceptions').upsert({
      team_member_id: selectedMember.id,
      exception_date: exceptionDate,
      exception_type: exceptionType,
      start_time: exceptionType === 'modified' ? exceptionStart : null,
      end_time: exceptionType === 'modified' ? exceptionEnd : null,
      note: exceptionNote.trim() || null,
      created_by: session.user.id,
    }, { onConflict: 'team_member_id,exception_date' })

    if (error) setMessage(error.message)
    else {
      setExceptionDate('')
      setExceptionNote('')
      setExceptionStart('')
      setExceptionEnd('')
      setExceptionType('off')
      setMessage('Schedule exception saved.')
      await loadData()
    }
    setSaving(false)
  }

  async function removeException(id: number) {
    if (profile?.role !== 'admin' || saving) return
    setSaving(true)
    const { error } = await supabase.from('team_schedule_exceptions').delete().eq('id', id)
    if (error) setMessage(error.message)
    else {
      setExceptions((current) => current.filter((item) => item.id !== id))
      setMessage('Schedule exception removed.')
    }
    setSaving(false)
  }

  async function saveAssignment() {
    if (!session || profile?.role !== 'admin' || !selectedMember || !assignmentProgram || saving) return
    if (assignmentEnd && assignmentStart && assignmentEnd < assignmentStart) {
      setMessage('The assignment end date cannot be before the start date.')
      return
    }

    setSaving(true)
    setMessage('')
    const { error } = await supabase.from('team_program_assignments').upsert({
      team_member_id: selectedMember.id,
      program_id: Number(assignmentProgram),
      assignment_role: assignmentRole.trim() || null,
      starts_on: assignmentStart || null,
      ends_on: assignmentEnd || null,
      active: true,
      created_by: session.user.id,
    }, { onConflict: 'team_member_id,program_id' })

    if (error) setMessage(error.message)
    else {
      setAssignmentRole('')
      setAssignmentStart('')
      setAssignmentEnd('')
      setMessage('Program assignment saved.')
      await loadData()
    }
    setSaving(false)
  }

  async function removeAssignment(id: number) {
    if (profile?.role !== 'admin' || saving) return
    setSaving(true)
    const { error } = await supabase.from('team_program_assignments').delete().eq('id', id)
    if (error) setMessage(error.message)
    else {
      setAssignments((current) => current.filter((item) => item.id !== id))
      setMessage('Program assignment removed.')
    }
    setSaving(false)
  }

  const activeMembers = members.filter((member) => member.active)
  const internCount = activeMembers.filter((member) => member.member_type === 'intern').length
  const volunteerCount = activeMembers.filter((member) => member.member_type === 'volunteer').length

  if (loading && !profile) return <main className="login-wrap"><div className="card login-card">Loading Team & Scheduling…</div></main>
  if (!session) return <main className="login-wrap"><div className="card login-card"><h1>Team & Scheduling</h1><p className="subtle">Sign in to Juanita Hub to continue.</p></div></main>
  if (!profile?.active) return <main className="login-wrap"><div className="card login-card"><h1>Team & Scheduling</h1><p className="subtle">An active staff account is required.</p></div></main>

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Juanita Hub<small>Staff & Intern Operations</small></div>
        <div className="toolbar"><span>{profile.display_name} <span className="badge">{profile.role}</span></span></div>
      </header>

      <main className="main team-page">
        <section className="hero team-hero">
          <div><span className="team-kicker">People operations</span><h1>Team & Scheduling</h1><p className="subtle">Manage staff, interns, volunteers, weekly schedules, exceptions, and program assignments without tying every person to a Juanita Hub login.</p></div>
          {profile.role === 'admin' && <button className="primary" onClick={newMember}>+ Add team member</button>}
        </section>

        {message && <div className="notice">{message}</div>}

        <section className="grid stats team-stats">
          <div className="card stat"><span className="subtle">Active team</span><strong>{activeMembers.length}</strong></div>
          <div className="card stat"><span className="subtle">Staff</span><strong>{activeMembers.filter((m) => m.member_type === 'staff').length}</strong></div>
          <div className="card stat"><span className="subtle">Interns</span><strong>{internCount}</strong></div>
          <div className="card stat"><span className="subtle">Volunteers</span><strong>{volunteerCount}</strong></div>
        </section>

        <div className="team-tabs" role="tablist">
          <button className={tab === 'team' ? 'active' : ''} onClick={() => setTab('team')}>Team Profiles</button>
          <button className={tab === 'schedule' ? 'active' : ''} onClick={() => setTab('schedule')}>Weekly Schedule</button>
          <button className={tab === 'programs' ? 'active' : ''} onClick={() => setTab('programs')}>Program Assignments</button>
        </div>

        <section className="team-layout">
          <aside className="card team-directory">
            <div className="team-directory-heading"><h2>Team</h2>{profile.role === 'admin' && <button className="ghost" onClick={newMember}>New</button>}</div>
            <div className="team-directory-list">
              {members.map((member) => (
                <button className={selectedId === member.id ? 'active' : ''} key={member.id} onClick={() => setSelectedId(member.id)}>
                  <span className={`team-avatar ${member.member_type}`}>{member.display_name.slice(0, 1).toUpperCase()}</span>
                  <span><strong>{member.display_name}</strong><small>{memberTypeLabel(member.member_type)}{member.title ? ` • ${member.title}` : ''}</small></span>
                  {!member.active && <em>Inactive</em>}
                </button>
              ))}
              {!members.length && <div className="team-empty">No team members yet.</div>}
            </div>
          </aside>

          <div className="team-workspace">
            {tab === 'team' && (
              <section className="card team-panel">
                <div className="team-panel-heading"><div><span className="team-kicker">{selectedMember ? 'Profile' : 'New profile'}</span><h2>{selectedMember?.display_name ?? 'Add a team member'}</h2></div>{selectedMember?.staff_user_id && <span className="team-linked-pill">Linked login</span>}</div>
                {profile.role !== 'admin' ? (
                  selectedMember ? <div className="team-readonly-profile">
                    <div><small>Type</small><strong>{memberTypeLabel(selectedMember.member_type)}</strong></div>
                    <div><small>Title / role</small><strong>{selectedMember.title || 'Not specified'}</strong></div>
                    <div><small>Supervisor</small><strong>{selectedMember.supervisor_member_id ? memberMap.get(selectedMember.supervisor_member_id)?.display_name ?? 'Team member' : 'Not assigned'}</strong></div>
                    <div><small>Term</small><strong>{selectedMember.start_date ? dateLabel(selectedMember.start_date) : 'No start date'} – {selectedMember.end_date ? dateLabel(selectedMember.end_date) : 'Open-ended'}</strong></div>
                  </div> : <div className="team-empty">Select a team member.</div>
                ) : (
                  <div className="team-form">
                    <div className="team-form-grid">
                      <label className="field"><span>Name *</span><input value={memberName} onChange={(event) => setMemberName(event.target.value)} /></label>
                      <label className="field"><span>Person type</span><select value={memberType} onChange={(event) => setMemberType(event.target.value as MemberType)}><option value="staff">Staff</option><option value="intern">Intern</option><option value="volunteer">Volunteer</option></select></label>
                      <label className="field"><span>Title / role</span><input value={memberTitle} onChange={(event) => setMemberTitle(event.target.value)} placeholder="Program Assistant, Youth Intern…" /></label>
                      <label className="field"><span>Supervisor</span><select value={memberSupervisor} onChange={(event) => setMemberSupervisor(event.target.value)}><option value="">None / not assigned</option>{members.filter((member) => member.id !== selectedMember?.id && member.active).map((member) => <option value={member.id} key={member.id}>{member.display_name}</option>)}</select></label>
                      <label className="field"><span>Start date</span><input type="date" value={memberStart} onChange={(event) => setMemberStart(event.target.value)} /></label>
                      <label className="field"><span>End date</span><input type="date" value={memberEnd} onChange={(event) => setMemberEnd(event.target.value)} /></label>
                    </div>
                    <label className="team-active-check"><input type="checkbox" checked={memberActive} onChange={(event) => setMemberActive(event.target.checked)} /><span><strong>Active team member</strong><small>Inactive people remain in historical schedules and assignments.</small></span></label>
                    {selectedMember?.staff_user_id && <div className="team-info-note">This profile is linked to a Juanita Hub login. Login permissions are still managed separately under <strong>Admin → Account Access</strong>.</div>}
                    <div className="team-actions"><button className="primary" disabled={saving || !memberName.trim()} onClick={() => void saveMember()}>{saving ? 'Saving…' : selectedMember ? 'Save profile' : 'Add team member'}</button></div>
                  </div>
                )}
              </section>
            )}

            {tab === 'schedule' && (
              <section className="card team-panel">
                <div className="team-panel-heading"><div><span className="team-kicker">Recurring staffing</span><h2>{selectedMember ? `${selectedMember.display_name}’s schedule` : 'Weekly schedule'}</h2></div></div>
                {!selectedMember ? <div className="team-empty">Select a team member to view their schedule.</div> : <>
                  <div className="team-week-grid">
                    {days.map((day) => {
                      const dayBlocks = selectedBlocks.filter((block) => block.day_of_week === day.value)
                      return <div className="team-day" key={day.value}><header><strong>{day.short}</strong><span>{dayBlocks.length}</span></header><div className="team-day-blocks">
                        {dayBlocks.length === 0 && <small className="team-day-empty">No recurring hours</small>}
                        {dayBlocks.map((block) => <article className={`team-schedule-block ${block.block_type}`} key={block.id}>
                          <strong>{timeLabel(block.start_time)}–{timeLabel(block.end_time)}</strong>
                          <span>{block.block_type === 'shift' ? 'Scheduled shift' : 'Available'}</span>
                          {block.program_id && <small>{programMap.get(block.program_id)?.name ?? 'Program'}</small>}
                          {block.location && <small>{block.location}</small>}
                          {block.effective_start && <small>{dateLabel(block.effective_start)}{block.effective_end ? ` – ${dateLabel(block.effective_end)}` : ' onward'}</small>}
                          {profile.role === 'admin' && <button className="team-inline-remove" onClick={() => void removeScheduleBlock(block.id)}>Remove</button>}
                        </article>)}
                      </div></div>
                    })}
                  </div>

                  {profile.role === 'admin' && <div className="team-builder">
                    <h3>Add recurring hours</h3>
                    <div className="team-form-grid">
                      <label className="field"><span>Day</span><select value={blockDay} onChange={(event) => setBlockDay(event.target.value)}>{days.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}</select></label>
                      <label className="field"><span>Type</span><select value={blockType} onChange={(event) => setBlockType(event.target.value as 'shift' | 'available')}><option value="shift">Scheduled shift</option><option value="available">Available</option></select></label>
                      <label className="field"><span>Start</span><input type="time" value={blockStart} onChange={(event) => setBlockStart(event.target.value)} /></label>
                      <label className="field"><span>End</span><input type="time" value={blockEnd} onChange={(event) => setBlockEnd(event.target.value)} /></label>
                      <label className="field"><span>Program</span><select value={blockProgram} onChange={(event) => setBlockProgram(event.target.value)}><option value="">General / no program</option>{programs.filter((program) => !['completed','archived'].includes(program.status)).map((program) => <option value={program.id} key={program.id}>{program.name}</option>)}</select></label>
                      <label className="field"><span>Location</span><input value={blockLocation} onChange={(event) => setBlockLocation(event.target.value)} placeholder="Center, computer lab…" /></label>
                      <label className="field"><span>Effective from</span><input type="date" value={blockEffectiveStart} onChange={(event) => setBlockEffectiveStart(event.target.value)} /></label>
                      <label className="field"><span>Through</span><input type="date" value={blockEffectiveEnd} onChange={(event) => setBlockEffectiveEnd(event.target.value)} /></label>
                      <label className="field full"><span>Notes</span><input value={blockNotes} onChange={(event) => setBlockNotes(event.target.value)} placeholder="Optional internal scheduling note" /></label>
                    </div>
                    <button className="primary" disabled={saving} onClick={() => void addScheduleBlock()}>Add recurring hours</button>
                  </div>}

                  <div className="team-exceptions">
                    <div className="team-panel-heading compact"><div><span className="team-kicker">One-off changes</span><h3>Schedule exceptions</h3></div></div>
                    <div className="team-exception-list">
                      {selectedExceptions.length === 0 && <div className="team-empty small">No one-off schedule changes recorded.</div>}
                      {selectedExceptions.map((item) => <article key={item.id}><span><strong>{dateLabel(item.exception_date)}</strong><small>{item.exception_type === 'off' ? 'Off / unavailable' : `Modified • ${timeLabel(item.start_time)}–${timeLabel(item.end_time)}`}{item.note ? ` • ${item.note}` : ''}</small></span>{profile.role === 'admin' && <button className="ghost" onClick={() => void removeException(item.id)}>Remove</button>}</article>)}
                    </div>
                    {profile.role === 'admin' && <div className="team-exception-form">
                      <label className="field"><span>Date</span><input type="date" value={exceptionDate} onChange={(event) => setExceptionDate(event.target.value)} /></label>
                      <label className="field"><span>Change</span><select value={exceptionType} onChange={(event) => setExceptionType(event.target.value as 'off' | 'modified')}><option value="off">Off / unavailable</option><option value="modified">Modified hours</option></select></label>
                      {exceptionType === 'modified' && <><label className="field"><span>Start</span><input type="time" value={exceptionStart} onChange={(event) => setExceptionStart(event.target.value)} /></label><label className="field"><span>End</span><input type="time" value={exceptionEnd} onChange={(event) => setExceptionEnd(event.target.value)} /></label></>}
                      <label className="field team-exception-note"><span>Note</span><input value={exceptionNote} onChange={(event) => setExceptionNote(event.target.value)} placeholder="Appointment, changed shift…" /></label>
                      <button className="primary" disabled={saving || !exceptionDate} onClick={() => void saveException()}>Save exception</button>
                    </div>}
                  </div>
                </>}
              </section>
            )}

            {tab === 'programs' && (
              <section className="card team-panel">
                <div className="team-panel-heading"><div><span className="team-kicker">Program staffing</span><h2>{selectedMember ? `${selectedMember.display_name}’s programs` : 'Program assignments'}</h2></div></div>
                {!selectedMember ? <div className="team-empty">Select a team member.</div> : <>
                  <div className="team-assignment-list">
                    {selectedAssignments.length === 0 && <div className="team-empty">No program assignments yet.</div>}
                    {selectedAssignments.map((assignment) => {
                      const program = programMap.get(assignment.program_id)
                      return <article key={assignment.id}><div><strong>{program?.name ?? 'Program'}</strong><span>{assignment.assignment_role || 'Team member'}</span><small>{assignment.starts_on ? dateLabel(assignment.starts_on) : 'No start date'} – {assignment.ends_on ? dateLabel(assignment.ends_on) : 'Open-ended'}{program?.season_label ? ` • ${program.season_label}` : ''}</small></div>{profile.role === 'admin' && <button className="ghost danger-button" onClick={() => void removeAssignment(assignment.id)}>Remove</button>}</article>
                    })}
                  </div>
                  {profile.role === 'admin' && <div className="team-builder">
                    <h3>Assign to a program</h3>
                    <div className="team-form-grid">
                      <label className="field"><span>Program</span><select value={assignmentProgram} onChange={(event) => setAssignmentProgram(event.target.value)}><option value="">Choose a program…</option>{programs.filter((program) => !['completed','archived'].includes(program.status)).map((program) => <option value={program.id} key={program.id}>{program.name}{program.season_label ? ` • ${program.season_label}` : ''}</option>)}</select></label>
                      <label className="field"><span>Role in program</span><input value={assignmentRole} onChange={(event) => setAssignmentRole(event.target.value)} placeholder="Lead, support, intern…" /></label>
                      <label className="field"><span>Starts</span><input type="date" value={assignmentStart} onChange={(event) => setAssignmentStart(event.target.value)} /></label>
                      <label className="field"><span>Ends</span><input type="date" value={assignmentEnd} onChange={(event) => setAssignmentEnd(event.target.value)} /></label>
                    </div>
                    <button className="primary" disabled={saving || !assignmentProgram} onClick={() => void saveAssignment()}>Save program assignment</button>
                  </div>}
                </>}
              </section>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
