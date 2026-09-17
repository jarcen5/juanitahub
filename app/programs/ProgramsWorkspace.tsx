'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import styles from './registration-options.module.css'

type StaffProfile = { display_name: string; role: 'staff' | 'admin'; active: boolean }
type RegistrationMode = 'full' | 'renewal' | 'summer_short' | 'permission_only' | 'short_youth' | 'adult_short'
type Program = {
  id: number
  name: string
  program_type: 'afterschool' | 'summer' | 'club' | 'class' | 'workshop' | 'special' | 'other'
  audience: 'youth' | 'adult' | 'family' | 'mixed'
  registration_mode: RegistrationMode
  season_label: string | null
  description: string | null
  location: string | null
  starts_on: string | null
  ends_on: string | null
  meeting_days: string[]
  start_time: string | null
  end_time: string | null
  capacity: number | null
  status: 'draft' | 'open' | 'closed' | 'completed' | 'archived'
}
type ProgramRegistrationOption = {
  id: number
  program_id: number
  registration_mode: RegistrationMode
  display_order: number
}
type Enrollment = {
  id: number
  program_id: number
  household_id: number | null
  child_id: number | null
  adult_participant_id: number | null
  status: 'pending' | 'enrolled' | 'waitlisted' | 'withdrawn' | 'completed' | 'declined'
  source: 'staff' | 'parent' | 'import'
  enrolled_at: string
}
type Child = { id: number; first_name: string; last_name: string | null }
type Household = { id: number; display_name: string }
type HouseholdLink = { household_id: number; child_id: number; is_primary: boolean; active: boolean }
type AdultParticipant = { id: number; first_name: string; last_name: string | null; status: string }

type ProgramForm = {
  name: string
  program_type: Program['program_type']
  audience: Program['audience']
  registration_modes: RegistrationMode[]
  season_label: string
  description: string
  location: string
  starts_on: string
  ends_on: string
  capacity: string
  status: Program['status']
  meeting_days: string[]
}

const dayOptions = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const registrationOrder: RegistrationMode[] = ['full', 'renewal', 'summer_short', 'permission_only', 'short_youth', 'adult_short']

const registrationLabels: Record<RegistrationMode, string> = {
  full: 'Full registration',
  renewal: 'Returning family renewal',
  summer_short: 'Summer short registration',
  permission_only: 'Permission only',
  short_youth: 'Short youth registration',
  adult_short: 'Adult registration',
}

const registrationDescriptions: Record<RegistrationMode, string> = {
  full: 'New families or children complete the full household, child, safety, and program registration.',
  renewal: 'Returning households review prefilled information, update changes, choose children, and sign current-year agreements.',
  summer_short: 'Existing households answer only summer-specific schedule, commitment, shirt-size, and permission questions.',
  permission_only: 'Existing Juanita Hub children need only a guardian permission form for this program.',
  short_youth: 'Youth outside the existing roster complete a lightweight child and guardian registration.',
  adult_short: 'Adults complete a simple class or workshop registration without child or guardian fields.',
}

const typeLabels: Record<Program['program_type'], string> = {
  afterschool: 'Afterschool',
  summer: 'Summer',
  club: 'Club',
  class: 'Class',
  workshop: 'Workshop',
  special: 'Special program',
  other: 'Other',
}

function defaultRegistrationModes(programType: Program['program_type'], audience: Program['audience']): RegistrationMode[] {
  if (audience === 'adult') return ['adult_short']
  if (audience === 'mixed') {
    if (programType === 'summer') return ['full', 'summer_short', 'adult_short']
    if (programType === 'afterschool') return ['full', 'renewal', 'adult_short']
    return ['permission_only', 'short_youth', 'adult_short']
  }
  if (programType === 'afterschool') return ['full', 'renewal']
  if (programType === 'summer') return ['full', 'summer_short']
  if (programType === 'club') return ['permission_only', 'short_youth']
  if (programType === 'class' || programType === 'workshop') return ['permission_only', 'short_youth']
  return ['short_youth']
}

function compatibleRegistrationModes(audience: Program['audience']): RegistrationMode[] {
  if (audience === 'adult') return ['adult_short']
  if (audience === 'mixed') return registrationOrder
  return registrationOrder.filter((mode) => mode !== 'adult_short')
}

function defaultProgram(): ProgramForm {
  return {
    name: '',
    program_type: 'club',
    audience: 'youth',
    registration_modes: ['permission_only', 'short_youth'],
    season_label: '',
    description: '',
    location: '',
    starts_on: '',
    ends_on: '',
    capacity: '',
    status: 'draft',
    meeting_days: [],
  }
}

function childName(child: Child) {
  return `${child.first_name}${child.last_name ? ` ${child.last_name}` : ''}`
}

function adultName(adult: AdultParticipant) {
  return `${adult.first_name}${adult.last_name ? ` ${adult.last_name}` : ''}`
}

function dateLabel(value: string | null) {
  if (!value) return 'Not set'
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ProgramsWorkspace() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [programs, setPrograms] = useState<Program[]>([])
  const [registrationOptions, setRegistrationOptions] = useState<ProgramRegistrationOption[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [children, setChildren] = useState<Child[]>([])
  const [households, setHouseholds] = useState<Household[]>([])
  const [householdLinks, setHouseholdLinks] = useState<HouseholdLink[]>([])
  const [adults, setAdults] = useState<AdultParticipant[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [programForm, setProgramForm] = useState<ProgramForm>(defaultProgram())
  const [selectedOptionDraft, setSelectedOptionDraft] = useState<RegistrationMode[]>([])
  const [childToEnroll, setChildToEnroll] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession)
    })
    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (session) void loadData()
    else setProfile(null)
  }, [session])

  async function loadData() {
    if (!session) return
    setLoading(true)
    setMessage('')
    const [profileResult, programsResult, optionsResult, enrollmentsResult, childrenResult, householdsResult, linksResult, adultsResult] = await Promise.all([
      supabase.from('staff_profiles').select('display_name, role, active').eq('user_id', session.user.id).maybeSingle(),
      supabase.from('programs').select('id, name, program_type, audience, registration_mode, season_label, description, location, starts_on, ends_on, meeting_days, start_time, end_time, capacity, status').order('created_at', { ascending: false }),
      supabase.from('program_registration_options').select('id, program_id, registration_mode, display_order').order('display_order').order('id'),
      supabase.from('program_enrollments').select('id, program_id, household_id, child_id, adult_participant_id, status, source, enrolled_at').order('enrolled_at'),
      supabase.from('children').select('id, first_name, last_name').eq('active', true).order('first_name').order('last_name'),
      supabase.from('households').select('id, display_name').eq('status', 'active').order('display_name'),
      supabase.from('household_children').select('household_id, child_id, is_primary, active').eq('active', true),
      supabase.from('adult_participants').select('id, first_name, last_name, status').eq('status', 'active').order('first_name').order('last_name'),
    ])

    setProfile(profileResult.data as StaffProfile | null)
    setPrograms((programsResult.data ?? []) as Program[])
    setRegistrationOptions((optionsResult.data ?? []) as ProgramRegistrationOption[])
    setEnrollments((enrollmentsResult.data ?? []) as Enrollment[])
    setChildren((childrenResult.data ?? []) as Child[])
    setHouseholds((householdsResult.data ?? []) as Household[])
    setHouseholdLinks((linksResult.data ?? []) as HouseholdLink[])
    setAdults((adultsResult.data ?? []) as AdultParticipant[])
    setMessage(profileResult.error?.message || programsResult.error?.message || optionsResult.error?.message || enrollmentsResult.error?.message || childrenResult.error?.message || householdsResult.error?.message || linksResult.error?.message || adultsResult.error?.message || '')
    setLoading(false)
  }

  const selected = programs.find((program) => program.id === selectedId) ?? null
  const childById = useMemo(() => new Map(children.map((child) => [child.id, child])), [children])
  const adultById = useMemo(() => new Map(adults.map((adult) => [adult.id, adult])), [adults])
  const householdById = useMemo(() => new Map(households.map((household) => [household.id, household])), [households])
  const enrollmentsByProgram = useMemo(() => {
    const map = new Map<number, Enrollment[]>()
    for (const enrollment of enrollments) map.set(enrollment.program_id, [...(map.get(enrollment.program_id) ?? []), enrollment])
    return map
  }, [enrollments])
  const registrationOptionsByProgram = useMemo(() => {
    const map = new Map<number, ProgramRegistrationOption[]>()
    for (const option of registrationOptions) map.set(option.program_id, [...(map.get(option.program_id) ?? []), option])
    return map
  }, [registrationOptions])

  useEffect(() => {
    if (!selected) {
      setSelectedOptionDraft([])
      return
    }
    const savedModes = (registrationOptionsByProgram.get(selected.id) ?? []).map((option) => option.registration_mode)
    setSelectedOptionDraft(savedModes.length ? savedModes : [selected.registration_mode])
  }, [selectedId, selected, registrationOptionsByProgram])

  function updateProgramType(programType: Program['program_type']) {
    setProgramForm((current) => ({
      ...current,
      program_type: programType,
      registration_modes: defaultRegistrationModes(programType, current.audience),
    }))
  }

  function updateAudience(audience: Program['audience']) {
    setProgramForm((current) => ({
      ...current,
      audience,
      registration_modes: defaultRegistrationModes(current.program_type, audience),
    }))
  }

  function toggleRegistrationMode(mode: RegistrationMode) {
    setProgramForm((current) => ({
      ...current,
      registration_modes: current.registration_modes.includes(mode)
        ? current.registration_modes.filter((value) => value !== mode)
        : registrationOrder.filter((value) => [...current.registration_modes, mode].includes(value)),
    }))
  }

  function toggleSelectedRegistrationMode(mode: RegistrationMode) {
    setSelectedOptionDraft((current) => current.includes(mode)
      ? current.filter((value) => value !== mode)
      : registrationOrder.filter((value) => [...current, mode].includes(value)))
  }

  function toggleMeetingDay(day: string) {
    setProgramForm((current) => ({
      ...current,
      meeting_days: current.meeting_days.includes(day) ? current.meeting_days.filter((value) => value !== day) : [...current.meeting_days, day],
    }))
  }

  async function createProgram() {
    if (profile?.role !== 'admin' || !programForm.name.trim() || programForm.registration_modes.length === 0 || saving) return
    setSaving(true)
    setMessage('')
    const capacity = programForm.capacity.trim() ? Number(programForm.capacity) : null
    const { data, error } = await supabase.from('programs').insert({
      name: programForm.name.trim(),
      program_type: programForm.program_type,
      audience: programForm.audience,
      registration_mode: programForm.registration_modes[0],
      season_label: programForm.season_label.trim() || null,
      description: programForm.description.trim() || null,
      location: programForm.location.trim() || null,
      starts_on: programForm.starts_on || null,
      ends_on: programForm.ends_on || null,
      capacity: Number.isFinite(capacity) ? capacity : null,
      status: programForm.status,
      meeting_days: programForm.meeting_days,
    }).select('id').single()

    if (error || !data) {
      setMessage(error?.message ?? 'Program could not be created.')
      setSaving(false)
      return
    }

    const optionRows = programForm.registration_modes.map((mode, index) => ({
      program_id: data.id,
      registration_mode: mode,
      display_order: index,
    }))
    const { error: optionsError } = await supabase.from('program_registration_options').insert(optionRows)

    if (optionsError) {
      await supabase.from('programs').delete().eq('id', data.id)
      setMessage(`The program was not saved because its registration options could not be saved: ${optionsError.message}`)
      setSaving(false)
      return
    }

    setProgramForm(defaultProgram())
    setSelectedId(data.id)
    setMessage('Program created with multiple registration paths. You can now build its roster.')
    await loadData()
    setSaving(false)
  }

  async function saveSelectedRegistrationOptions() {
    if (!selected || profile?.role !== 'admin' || selectedOptionDraft.length === 0 || saving) return
    setSaving(true)
    setMessage('')

    const saved = registrationOptionsByProgram.get(selected.id) ?? []
    const savedModes = new Set(saved.map((option) => option.registration_mode))
    const draftModes = new Set(selectedOptionDraft)
    const toAdd = selectedOptionDraft.filter((mode) => !savedModes.has(mode))
    const toRemove = saved.filter((option) => !draftModes.has(option.registration_mode))

    const { error: legacyError } = await supabase.from('programs').update({ registration_mode: selectedOptionDraft[0] }).eq('id', selected.id)
    if (legacyError) {
      setMessage(legacyError.message)
      setSaving(false)
      return
    }

    if (toAdd.length) {
      const { error } = await supabase.from('program_registration_options').insert(toAdd.map((mode) => ({
        program_id: selected.id,
        registration_mode: mode,
        display_order: registrationOrder.indexOf(mode),
      })))
      if (error) {
        setMessage(error.message)
        setSaving(false)
        return
      }
    }

    for (const option of toRemove) {
      const { error } = await supabase.from('program_registration_options').delete().eq('id', option.id)
      if (error) {
        setMessage(error.message)
        setSaving(false)
        return
      }
    }

    setMessage('Registration options updated.')
    await loadData()
    setSaving(false)
  }

  async function enrollChild() {
    if (!selected || profile?.role !== 'admin' || !childToEnroll || saving) return
    const childId = Number(childToEnroll)
    const existing = (enrollmentsByProgram.get(selected.id) ?? []).find((enrollment) => enrollment.child_id === childId)
    if (existing) {
      setMessage('That child already has a record for this program. Update their status instead of adding a duplicate.')
      return
    }
    const primaryHousehold = householdLinks.find((link) => link.child_id === childId && link.active && link.is_primary)
    setSaving(true)
    const { error } = await supabase.from('program_enrollments').insert({
      program_id: selected.id,
      child_id: childId,
      household_id: primaryHousehold?.household_id ?? null,
      status: 'enrolled',
      source: 'staff',
    })
    if (error) setMessage(error.message)
    else {
      setChildToEnroll('')
      setMessage('Child added to the program roster.')
      await loadData()
    }
    setSaving(false)
  }

  async function changeEnrollmentStatus(enrollment: Enrollment, status: Enrollment['status']) {
    if (profile?.role !== 'admin' || saving) return
    setSaving(true)
    const { error } = await supabase.from('program_enrollments').update({ status }).eq('id', enrollment.id)
    if (error) setMessage(error.message)
    else {
      setMessage('Enrollment status updated.')
      await loadData()
    }
    setSaving(false)
  }

  async function removeAccidentalEnrollment(enrollment: Enrollment, participantName: string) {
    if (profile?.role !== 'admin' || saving) return
    if (enrollment.source !== 'staff') {
      setMessage('Parent-submitted or imported enrollment records should be withdrawn or declined instead of permanently removed.')
      return
    }

    const confirmed = window.confirm(`Remove ${participantName} from this program roster?\n\nUse this only for an accidental staff-added entry. This permanently deletes the enrollment record.`)
    if (!confirmed) return

    setSaving(true)
    setMessage('')
    const { data, error } = await supabase
      .from('program_enrollments')
      .delete()
      .eq('id', enrollment.id)
      .eq('source', 'staff')
      .select('id')

    if (error) {
      setMessage(error.message)
    } else if (!data || data.length === 0) {
      setMessage('Nothing was removed. The enrollment may have changed or your account may not have permission.')
    } else {
      setMessage(`${participantName} was removed from the program roster.`)
      await loadData()
    }
    setSaving(false)
  }

  async function changeProgramStatus(status: Program['status']) {
    if (!selected || profile?.role !== 'admin' || saving) return
    setSaving(true)
    const { error } = await supabase.from('programs').update({ status }).eq('id', selected.id)
    if (error) setMessage(error.message)
    else {
      setMessage('Program status updated.')
      await loadData()
    }
    setSaving(false)
  }

  if (loading && !session) return <main className="login-wrap"><div className="card login-card">Loading programs…</div></main>
  if (!session) return <main className="login-wrap"><section className="card login-card"><h1>Programs</h1><p className="subtle">Sign in through Juanita Hub to continue.</p></section></main>
  if (!profile?.active) return <main className="login-wrap"><section className="card login-card"><h1>Programs</h1><div className="notice">Your staff account must be active.</div></section></main>

  const selectedRoster = selected ? enrollmentsByProgram.get(selected.id) ?? [] : []
  const selectedYouthIds = new Set(selectedRoster.filter((enrollment) => enrollment.child_id).map((enrollment) => enrollment.child_id as number))
  const activeCount = selectedRoster.filter((enrollment) => ['pending', 'enrolled', 'waitlisted'].includes(enrollment.status)).length
  const selectedModes = selected
    ? (registrationOptionsByProgram.get(selected.id) ?? []).map((option) => option.registration_mode)
    : []
  const displayedSelectedModes = selectedModes.length ? selectedModes : selected ? [selected.registration_mode] : []
  const availableCreationModes = compatibleRegistrationModes(programForm.audience)
  const availableSelectedModes = selected ? compatibleRegistrationModes(selected.audience) : []

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Juanita Hub<small>Programs & Enrollments</small></div>
        <div className="toolbar"><span>{profile.display_name} <span className="badge">{profile.role}</span></span></div>
      </header>

      <main className="main programs-page">
        <section className="hero programs-hero">
          <div><span className="programs-eyebrow">Programs</span><h1>Programs & Enrollments</h1><p className="subtle">One program can support different registration paths for new families, returning households, outside youth, and adults.</p></div>
          <div className="programs-mode-pill">Flexible registration paths</div>
        </section>

        {message && <div className="notice">{message}</div>}

        {profile.role === 'admin' && (
          <section className="card program-builder">
            <div className="program-builder-heading"><div><small>Admin setup</small><h2>Create a program</h2></div><span>Choose every registration path this program should accept.</span></div>
            <div className="program-form-grid">
              <label className="field full"><span>Program name</span><input value={programForm.name} onChange={(event) => setProgramForm((current) => ({ ...current, name: event.target.value }))} placeholder="Afterschool 2026-27, Robotics Club, Summer 2027…" /></label>
              <label className="field"><span>Program type</span><select value={programForm.program_type} onChange={(event) => updateProgramType(event.target.value as Program['program_type'])}>{Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label className="field"><span>Audience</span><select value={programForm.audience} onChange={(event) => updateAudience(event.target.value as Program['audience'])}><option value="youth">Youth</option><option value="adult">Adult</option><option value="family">Family</option><option value="mixed">Mixed</option></select></label>

              <div className={styles.registrationField}>
                <div className={styles.registrationHeading}><span>Registration options</span><small>Select all that apply. Juanita Hub will eventually route families to the appropriate form.</small></div>
                <div className={styles.optionsGrid}>
                  {availableCreationModes.map((mode) => {
                    const checked = programForm.registration_modes.includes(mode)
                    return <label key={mode} className={`${styles.optionCard} ${checked ? styles.selected : ''}`}><input type="checkbox" checked={checked} onChange={() => toggleRegistrationMode(mode)} /><span className={styles.optionCopy}><strong>{registrationLabels[mode]}</strong><small>{registrationDescriptions[mode]}</small></span></label>
                  })}
                </div>
                {programForm.registration_modes.length === 0 && <div className={styles.selectionError}>Choose at least one registration option before creating the program.</div>}
              </div>

              <label className="field"><span>Season / school year</span><input value={programForm.season_label} onChange={(event) => setProgramForm((current) => ({ ...current, season_label: event.target.value }))} placeholder="Summer 2027 or 2027-2028" /></label>
              <label className="field"><span>Starts</span><input type="date" value={programForm.starts_on} onChange={(event) => setProgramForm((current) => ({ ...current, starts_on: event.target.value }))} /></label>
              <label className="field"><span>Ends</span><input type="date" value={programForm.ends_on} onChange={(event) => setProgramForm((current) => ({ ...current, ends_on: event.target.value }))} /></label>
              <label className="field"><span>Capacity</span><input type="number" min="1" value={programForm.capacity} onChange={(event) => setProgramForm((current) => ({ ...current, capacity: event.target.value }))} placeholder="Optional" /></label>
              <label className="field"><span>Status</span><select value={programForm.status} onChange={(event) => setProgramForm((current) => ({ ...current, status: event.target.value as Program['status'] }))}><option value="draft">Draft</option><option value="open">Open</option><option value="closed">Closed</option><option value="completed">Completed</option><option value="archived">Archived</option></select></label>
              <label className="field full"><span>Location</span><input value={programForm.location} onChange={(event) => setProgramForm((current) => ({ ...current, location: event.target.value }))} /></label>
              <label className="field full"><span>Description</span><textarea rows={3} value={programForm.description} onChange={(event) => setProgramForm((current) => ({ ...current, description: event.target.value }))} /></label>
            </div>
            <div className="program-days"><span>Typical meeting days</span><div>{dayOptions.map((day) => <label key={day} className={programForm.meeting_days.includes(day) ? 'selected' : ''}><input type="checkbox" checked={programForm.meeting_days.includes(day)} onChange={() => toggleMeetingDay(day)} /><span>{day.slice(0, 3)}</span></label>)}</div></div>
            <div className="program-builder-actions"><button type="button" className="primary" onClick={() => void createProgram()} disabled={saving || !programForm.name.trim() || programForm.registration_modes.length === 0}>{saving ? 'Saving…' : 'Create program'}</button></div>
          </section>
        )}

        <div className="programs-layout">
          <section className="card programs-list-panel">
            <div className="programs-panel-heading"><div><small>Program directory</small><h2>{programs.length} programs</h2></div></div>
            <div className="programs-list">
              {programs.map((program) => {
                const roster = enrollmentsByProgram.get(program.id) ?? []
                return <button type="button" key={program.id} className={`program-list-item ${selectedId === program.id ? 'active' : ''}`} onClick={() => setSelectedId(program.id)}><span><strong>{program.name}</strong><small>{typeLabels[program.program_type]}{program.season_label ? ` • ${program.season_label}` : ''}</small></span><span><b>{roster.length}</b><small>roster</small></span><em className={`program-status ${program.status}`}>{program.status}</em></button>
              })}
              {programs.length === 0 && <div className="programs-empty">No programs yet. The first one can be afterschool, summer, a club, a class, or another center activity.</div>}
            </div>
          </section>

          <section className="card program-detail-panel">
            {!selected ? (
              <div className="programs-empty large"><strong>Select a program</strong><span>Its registration options and roster will appear here.</span></div>
            ) : (
              <>
                <div className="program-detail-heading"><div><span className="programs-eyebrow">{typeLabels[selected.program_type]}</span><h2>{selected.name}</h2><p>{selected.season_label || 'No season label'}</p></div><div className="program-detail-status"><span className={`program-status ${selected.status}`}>{selected.status}</span>{profile.role === 'admin' && <select value={selected.status} onChange={(event) => void changeProgramStatus(event.target.value as Program['status'])} disabled={saving}><option value="draft">Draft</option><option value="open">Open</option><option value="closed">Closed</option><option value="completed">Completed</option><option value="archived">Archived</option></select>}</div></div>

                <div className="program-facts">
                  <div><small>Registration options</small><span className={styles.detailOptions}>{displayedSelectedModes.map((mode) => <span className={styles.optionChip} key={mode}>{registrationLabels[mode]}</span>)}</span></div>
                  <div><small>Audience</small><strong>{selected.audience}</strong></div>
                  <div><small>Dates</small><strong>{dateLabel(selected.starts_on)} – {dateLabel(selected.ends_on)}</strong></div>
                  <div><small>Capacity</small><strong>{selected.capacity ?? 'No limit set'}</strong></div>
                  <div><small>Meeting days</small><strong>{selected.meeting_days.length ? selected.meeting_days.join(', ') : 'Not set'}</strong></div>
                  <div><small>Active roster</small><strong>{activeCount}</strong></div>
                </div>

                {profile.role === 'admin' && (
                  <div className={styles.editOptions}>
                    <div className={styles.editOptionsHeader}><div><small>Admin setup</small><strong>Edit registration options</strong></div><span className="subtle">A program can accept more than one path.</span></div>
                    <div className={styles.optionsGrid}>
                      {availableSelectedModes.map((mode) => {
                        const checked = selectedOptionDraft.includes(mode)
                        return <label key={mode} className={`${styles.optionCard} ${checked ? styles.selected : ''}`}><input type="checkbox" checked={checked} onChange={() => toggleSelectedRegistrationMode(mode)} /><span className={styles.optionCopy}><strong>{registrationLabels[mode]}</strong><small>{registrationDescriptions[mode]}</small></span></label>
                      })}
                    </div>
                    {selectedOptionDraft.length === 0 && <div className={styles.selectionError}>Keep at least one registration option enabled.</div>}
                    <div className={styles.editActions}><button type="button" className="primary" onClick={() => void saveSelectedRegistrationOptions()} disabled={saving || selectedOptionDraft.length === 0}>Save registration options</button></div>
                  </div>
                )}

                {selected.description && <div className="program-description">{selected.description}</div>}

                <section className="program-roster-section">
                  <div className="program-roster-heading"><div><small>Enrollment</small><h3>Program roster</h3></div></div>

                  {profile.role === 'admin' && ['youth', 'family', 'mixed'].includes(selected.audience) && (
                    <div className="program-enroll-bar"><select value={childToEnroll} onChange={(event) => setChildToEnroll(event.target.value)}><option value="">Choose an existing child…</option>{children.filter((child) => !selectedYouthIds.has(child.id)).map((child) => <option value={child.id} key={child.id}>{childName(child)}</option>)}</select><button type="button" className="primary" onClick={() => void enrollChild()} disabled={!childToEnroll || saving}>Add to roster</button></div>
                  )}

                  <div className="program-roster">
                    {selectedRoster.map((enrollment) => {
                      const child = enrollment.child_id ? childById.get(enrollment.child_id) : null
                      const adult = enrollment.adult_participant_id ? adultById.get(enrollment.adult_participant_id) : null
                      const household = enrollment.household_id ? householdById.get(enrollment.household_id) : null
                      const name = child ? childName(child) : adult ? adultName(adult) : 'Participant'
                      return (
                        <article className="program-roster-row" key={enrollment.id}>
                          <div>
                            <strong>{name}</strong>
                            <small>{household ? household.display_name : adult ? 'Adult participant' : 'No household linked'} • {enrollment.source}</small>
                          </div>
                          {profile.role === 'admin' ? (
                            <div className="program-roster-actions">
                              <select value={enrollment.status} onChange={(event) => void changeEnrollmentStatus(enrollment, event.target.value as Enrollment['status'])} disabled={saving} aria-label={`Enrollment status for ${name}`}>
                                <option value="pending">Pending</option>
                                <option value="enrolled">Enrolled</option>
                                <option value="waitlisted">Waitlisted</option>
                                <option value="withdrawn">Withdrawn</option>
                                <option value="completed">Completed</option>
                                <option value="declined">Declined</option>
                              </select>
                              {enrollment.source === 'staff' && (
                                <button type="button" className="ghost danger-button program-remove-enrollment" onClick={() => void removeAccidentalEnrollment(enrollment, name)} disabled={saving} aria-label={`Remove accidental roster entry for ${name}`}>Remove</button>
                              )}
                            </div>
                          ) : <span className={`enrollment-status ${enrollment.status}`}>{enrollment.status}</span>}
                        </article>
                      )
                    })}
                    {selectedRoster.length === 0 && <div className="programs-empty">No one is enrolled yet.</div>}
                  </div>
                </section>

                {['adult', 'mixed'].includes(selected.audience) && adults.length === 0 && <div className="program-adult-note"><strong>Adult participant support is ready in the database.</strong><span>The lightweight adult intake screen will be the next UI layer before public adult registration forms.</span></div>}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
