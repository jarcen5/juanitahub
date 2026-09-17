'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type StaffProfile = { display_name: string; role: 'staff' | 'admin'; active: boolean }
type Child = { id: number; first_name: string; last_name: string | null; active: boolean }
type Registration = {
  id: number; child_id: number; school_year: string; birth_date: string | null; school: string | null; grade: string | null;
  status: 'active' | 'expired'; show_birthday_publicly: boolean; attendance_days: string[]; attends_other_program: boolean;
  other_program_arrival_notes: string | null; dismissal_plan: string | null; dismissal_notes: string | null
}
type Guardian = {
  id: number; registration_id: number; name: string; relationship: string | null; phone: string | null; secondary_phone: string | null;
  email: string | null; address: string | null; preferred_contact: string | null; is_primary: boolean; is_emergency: boolean;
  authorized_pickup: boolean; notes: string | null
}
type HealthInfo = {
  registration_id: number; allergies: string | null; medical_conditions: string | null; learning_support: string | null;
  behavioral_support: string | null; actions_to_take: string | null; important_care_notes: string | null
}
type AuthorizedPickup = { id: number; registration_id: number; name: string; relationship: string | null; phone: string | null; notes: string | null }
type Agreement = {
  registration_id: number; media_consent: boolean | null; program_consent: boolean | null; removal_acknowledgment: boolean | null;
  rules_acknowledgment: boolean | null; friday_participation_acknowledgment: boolean | null; info_accuracy_acknowledgment: boolean | null;
  signature_name: string | null; signature_date: string | null; terms_version: string | null
}
type ConsentValue = '' | 'yes' | 'no'
type PickupDraft = { name: string; relationship: string; phone: string; notes: string }
type ProfileForm = {
  school_year: string; birth_date: string; school: string; grade: string; show_birthday_publicly: boolean;
  attendance_days: string[]; attends_other_program: boolean; other_program_arrival_notes: string; dismissal_plan: string; dismissal_notes: string;
  primary_name: string; primary_relationship: string; primary_phone: string; primary_secondary_phone: string; primary_email: string;
  primary_address: string; preferred_contact: string; emergency_name: string; emergency_relationship: string; emergency_phone: string;
  allergies: string; medical_conditions: string; learning_support: string; behavioral_support: string; actions_to_take: string; important_care_notes: string;
  authorized_pickups: PickupDraft[]; media_consent: ConsentValue; program_consent: ConsentValue; removal_acknowledgment: ConsentValue;
  rules_acknowledgment: ConsentValue; friday_acknowledgment: ConsentValue; info_accuracy_acknowledgment: ConsentValue;
  signature_name: string; signature_date: string; terms_version: string
}

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const dismissalOptions = [
  ['', 'Not recorded'],
  ['walk_home', 'May walk home alone'],
  ['no_walk_designated_pickup', 'May not walk home alone — designated pickup required'],
  ['elevator_independent', 'May take the elevator independently / with program children'],
  ['leave_with_approved_person', 'May leave with an approved older youth or adult'],
  ['other', 'Other / custom plan'],
] as const

function childName(child: Child) { return `${child.first_name}${child.last_name ? ` ${child.last_name}` : ''}` }
function currentSchoolYear() { const now = new Date(); const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1; return `${y}-${y + 1}` }
function calculateAge(date: string | null) { if (!date) return null; const b = new Date(`${date}T12:00:00`); const n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a -= 1; return a }
function formatBirthday(date: string | null) { return date ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : 'Not added' }
function consentToForm(value: boolean | null | undefined): ConsentValue { return value == null ? '' : value ? 'yes' : 'no' }
function formToConsent(value: ConsentValue) { return value === '' ? null : value === 'yes' }
function dismissalLabel(value: string | null) { return dismissalOptions.find(([key]) => key === (value ?? ''))?.[1] ?? value ?? 'Not recorded' }
function emptyPickup(): PickupDraft { return { name: '', relationship: '', phone: '', notes: '' } }
function blankForm(): ProfileForm {
  return {
    school_year: currentSchoolYear(), birth_date: '', school: '', grade: '', show_birthday_publicly: true,
    attendance_days: [], attends_other_program: false, other_program_arrival_notes: '', dismissal_plan: '', dismissal_notes: '',
    primary_name: '', primary_relationship: '', primary_phone: '', primary_secondary_phone: '', primary_email: '', primary_address: '', preferred_contact: '',
    emergency_name: '', emergency_relationship: '', emergency_phone: '', allergies: '', medical_conditions: '', learning_support: '', behavioral_support: '', actions_to_take: '', important_care_notes: '',
    authorized_pickups: [], media_consent: '', program_consent: '', removal_acknowledgment: '', rules_acknowledgment: '', friday_acknowledgment: '', info_accuracy_acknowledgment: '',
    signature_name: '', signature_date: '', terms_version: currentSchoolYear(),
  }
}

export default function ChildrenPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [children, setChildren] = useState<Child[]>([])
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [guardians, setGuardians] = useState<Guardian[]>([])
  const [healthInfo, setHealthInfo] = useState<HealthInfo[]>([])
  const [pickups, setPickups] = useState<AuthorizedPickup[]>([])
  const [agreements, setAgreements] = useState<Agreement[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [selectedChild, setSelectedChild] = useState<Child | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<ProfileForm>(blankForm())

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => { if (mounted) { setSession(data.session); if (!data.session) setLoading(false) } })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => { if (mounted) setSession(nextSession) })
    return () => { mounted = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => { if (!session) { setProfile(null); return } void loadData() }, [session])

  async function loadData() {
    if (!session) return
    setLoading(true); setMessage('')
    const [profileResult, childrenResult, registrationsResult] = await Promise.all([
      supabase.from('staff_profiles').select('display_name, role, active').eq('user_id', session.user.id).maybeSingle(),
      supabase.from('children').select('id, first_name, last_name, active').eq('active', true).order('first_name').order('last_name'),
      supabase.from('child_registrations').select('id, child_id, school_year, birth_date, school, grade, status, show_birthday_publicly, attendance_days, attends_other_program, other_program_arrival_notes, dismissal_plan, dismissal_notes').eq('status', 'active'),
    ])
    const nextProfile = profileResult.data as StaffProfile | null
    const nextRegistrations = (registrationsResult.data ?? []) as Registration[]
    setProfile(nextProfile); setChildren((childrenResult.data ?? []) as Child[]); setRegistrations(nextRegistrations)

    let nextGuardians: Guardian[] = [], nextHealth: HealthInfo[] = [], nextPickups: AuthorizedPickup[] = [], nextAgreements: Agreement[] = []
    if (nextProfile?.role === 'admin' && nextRegistrations.length > 0) {
      const ids = nextRegistrations.map((r) => r.id)
      const [g, h, p, a] = await Promise.all([
        supabase.from('child_guardians').select('id, registration_id, name, relationship, phone, secondary_phone, email, address, preferred_contact, is_primary, is_emergency, authorized_pickup, notes').in('registration_id', ids).order('is_primary', { ascending: false }),
        supabase.from('child_health_info').select('registration_id, allergies, medical_conditions, learning_support, behavioral_support, actions_to_take, important_care_notes').in('registration_id', ids),
        supabase.from('child_authorized_pickups').select('id, registration_id, name, relationship, phone, notes').in('registration_id', ids).order('name'),
        supabase.from('child_registration_agreements').select('registration_id, media_consent, program_consent, removal_acknowledgment, rules_acknowledgment, friday_participation_acknowledgment, info_accuracy_acknowledgment, signature_name, signature_date, terms_version').in('registration_id', ids),
      ])
      nextGuardians = (g.data ?? []) as Guardian[]; nextHealth = (h.data ?? []) as HealthInfo[]; nextPickups = (p.data ?? []) as AuthorizedPickup[]; nextAgreements = (a.data ?? []) as Agreement[]
      const detailError = g.error ?? h.error ?? p.error ?? a.error
      if (detailError) setMessage(detailError.message)
    }
    setGuardians(nextGuardians); setHealthInfo(nextHealth); setPickups(nextPickups); setAgreements(nextAgreements)
    setMessage((current) => current || profileResult.error?.message || childrenResult.error?.message || registrationsResult.error?.message || '')
    setLoading(false)
  }

  const registrationByChild = useMemo(() => new Map(registrations.map((r) => [r.child_id, r])), [registrations])
  const guardiansByRegistration = useMemo(() => { const map = new Map<number, Guardian[]>(); guardians.forEach((g) => map.set(g.registration_id, [...(map.get(g.registration_id) ?? []), g])); return map }, [guardians])
  const healthByRegistration = useMemo(() => new Map(healthInfo.map((h) => [h.registration_id, h])), [healthInfo])
  const pickupsByRegistration = useMemo(() => { const map = new Map<number, AuthorizedPickup[]>(); pickups.forEach((p) => map.set(p.registration_id, [...(map.get(p.registration_id) ?? []), p])); return map }, [pickups])
  const agreementByRegistration = useMemo(() => new Map(agreements.map((a) => [a.registration_id, a])), [agreements])
  const visibleChildren = useMemo(() => {
    const q = search.trim().toLowerCase(); if (!q) return children
    return children.filter((child) => { const r = registrationByChild.get(child.id); return [childName(child), r?.school ?? '', r?.grade ?? ''].some((v) => v.toLowerCase().includes(q)) })
  }, [children, registrationByChild, search])

  function closeProfile() { if (!saving) { setSelectedChild(null); setEditing(false) } }
  function openEditor(child: Child) {
    if (profile?.role !== 'admin') return
    const r = registrationByChild.get(child.id)
    const contacts = r ? guardiansByRegistration.get(r.id) ?? [] : []
    const primary = contacts.find((g) => g.is_primary)
    const emergency = contacts.find((g) => g.is_emergency && !g.is_primary) ?? contacts.find((g) => g.is_emergency)
    const health = r ? healthByRegistration.get(r.id) : undefined
    const agreement = r ? agreementByRegistration.get(r.id) : undefined
    const existingPickups = r ? pickupsByRegistration.get(r.id) ?? [] : []
    setForm({
      school_year: r?.school_year ?? currentSchoolYear(), birth_date: r?.birth_date ?? '', school: r?.school ?? '', grade: r?.grade ?? '', show_birthday_publicly: r?.show_birthday_publicly ?? true,
      attendance_days: r?.attendance_days ?? [], attends_other_program: r?.attends_other_program ?? false, other_program_arrival_notes: r?.other_program_arrival_notes ?? '', dismissal_plan: r?.dismissal_plan ?? '', dismissal_notes: r?.dismissal_notes ?? '',
      primary_name: primary?.name ?? '', primary_relationship: primary?.relationship ?? '', primary_phone: primary?.phone ?? '', primary_secondary_phone: primary?.secondary_phone ?? '', primary_email: primary?.email ?? '', primary_address: primary?.address ?? '', preferred_contact: primary?.preferred_contact ?? '',
      emergency_name: emergency?.name ?? '', emergency_relationship: emergency?.relationship ?? '', emergency_phone: emergency?.phone ?? '',
      allergies: health?.allergies ?? '', medical_conditions: health?.medical_conditions ?? '', learning_support: health?.learning_support ?? '', behavioral_support: health?.behavioral_support ?? '', actions_to_take: health?.actions_to_take ?? '', important_care_notes: health?.important_care_notes ?? '',
      authorized_pickups: existingPickups.map((p) => ({ name: p.name, relationship: p.relationship ?? '', phone: p.phone ?? '', notes: p.notes ?? '' })),
      media_consent: consentToForm(agreement?.media_consent), program_consent: consentToForm(agreement?.program_consent), removal_acknowledgment: consentToForm(agreement?.removal_acknowledgment),
      rules_acknowledgment: consentToForm(agreement?.rules_acknowledgment), friday_acknowledgment: consentToForm(agreement?.friday_participation_acknowledgment), info_accuracy_acknowledgment: consentToForm(agreement?.info_accuracy_acknowledgment),
      signature_name: agreement?.signature_name ?? '', signature_date: agreement?.signature_date ?? '', terms_version: agreement?.terms_version ?? (r?.school_year ?? currentSchoolYear()),
    })
    setSelectedChild(child); setEditing(true); setMessage('')
  }

  function toggleDay(day: string) { setForm((current) => ({ ...current, attendance_days: current.attendance_days.includes(day) ? current.attendance_days.filter((d) => d !== day) : [...current.attendance_days, day] })) }
  function updatePickup(index: number, field: keyof PickupDraft, value: string) { setForm((current) => ({ ...current, authorized_pickups: current.authorized_pickups.map((p, i) => i === index ? { ...p, [field]: value } : p) })) }

  async function saveProfile() {
    if (!session || !selectedChild || profile?.role !== 'admin' || saving) return
    if (!form.school_year.trim()) { setMessage('Enter the school year for this registration.'); return }
    setSaving(true); setMessage('')
    let registrationId = registrationByChild.get(selectedChild.id)?.id
    const registrationRow = {
      school_year: form.school_year.trim(), birth_date: form.birth_date || null, school: form.school.trim() || null, grade: form.grade.trim() || null,
      show_birthday_publicly: form.show_birthday_publicly, attendance_days: form.attendance_days, attends_other_program: form.attends_other_program,
      other_program_arrival_notes: form.attends_other_program ? (form.other_program_arrival_notes.trim() || null) : null,
      dismissal_plan: form.dismissal_plan || null, dismissal_notes: form.dismissal_notes.trim() || null, updated_by: session.user.id,
    }
    if (registrationId) {
      const { error } = await supabase.from('child_registrations').update(registrationRow).eq('id', registrationId)
      if (error) { setMessage(error.message); setSaving(false); return }
    } else {
      const { data, error } = await supabase.from('child_registrations').insert({ child_id: selectedChild.id, ...registrationRow, status: 'active', created_by: session.user.id }).select('id').single()
      if (error || !data) { setMessage(error?.message ?? 'Registration could not be created.'); setSaving(false); return }
      registrationId = data.id as number
    }
    if (!registrationId) { setMessage('Registration could not be saved.'); setSaving(false); return }

    const existingContacts = guardiansByRegistration.get(registrationId) ?? []
    const saveContact = async (existing: Guardian | undefined, values: Partial<Guardian>, flags: { is_primary: boolean; is_emergency: boolean }) => {
      const hasContent = Boolean((values.name ?? '').trim() || (values.phone ?? '').trim() || (values.email ?? '').trim() || (values.address ?? '').trim())
      if (!hasContent && existing) return supabase.from('child_guardians').delete().eq('id', existing.id)
      if (!hasContent) return { error: null }
      const row = { registration_id: registrationId, name: (values.name ?? '').trim() || (flags.is_emergency ? 'Emergency contact' : 'Parent / guardian'), relationship: (values.relationship ?? '').trim() || null, phone: (values.phone ?? '').trim() || null, secondary_phone: (values.secondary_phone ?? '').trim() || null, email: (values.email ?? '').trim() || null, address: (values.address ?? '').trim() || null, preferred_contact: (values.preferred_contact ?? '').trim() || null, is_primary: flags.is_primary, is_emergency: flags.is_emergency, authorized_pickup: false, created_by: session.user.id, updated_by: session.user.id }
      return existing ? supabase.from('child_guardians').update(row).eq('id', existing.id) : supabase.from('child_guardians').insert(row)
    }
    const primary = existingContacts.find((g) => g.is_primary)
    const emergency = existingContacts.find((g) => g.is_emergency && !g.is_primary) ?? existingContacts.find((g) => g.is_emergency)
    const primaryResult = await saveContact(primary, { name: form.primary_name, relationship: form.primary_relationship, phone: form.primary_phone, secondary_phone: form.primary_secondary_phone, email: form.primary_email, address: form.primary_address, preferred_contact: form.preferred_contact }, { is_primary: true, is_emergency: false })
    if (primaryResult.error) { setMessage(primaryResult.error.message); setSaving(false); return }
    const emergencyResult = await saveContact(emergency, { name: form.emergency_name, relationship: form.emergency_relationship, phone: form.emergency_phone }, { is_primary: false, is_emergency: true })
    if (emergencyResult.error) { setMessage(emergencyResult.error.message); setSaving(false); return }

    const existingHealth = healthByRegistration.get(registrationId)
    const hasHealth = Boolean([form.allergies, form.medical_conditions, form.learning_support, form.behavioral_support, form.actions_to_take, form.important_care_notes].some((v) => v.trim()))
    if (hasHealth) {
      const { error } = await supabase.from('child_health_info').upsert({ registration_id: registrationId, allergies: form.allergies.trim() || null, medical_conditions: form.medical_conditions.trim() || null, learning_support: form.learning_support.trim() || null, behavioral_support: form.behavioral_support.trim() || null, actions_to_take: form.actions_to_take.trim() || null, important_care_notes: form.important_care_notes.trim() || null, created_by: session.user.id, updated_by: session.user.id }, { onConflict: 'registration_id' })
      if (error) { setMessage(error.message); setSaving(false); return }
    } else if (existingHealth) {
      const { error } = await supabase.from('child_health_info').delete().eq('registration_id', registrationId)
      if (error) { setMessage(error.message); setSaving(false); return }
    }

    const pickupRows = form.authorized_pickups.filter((p) => p.name.trim()).map((p) => ({ registration_id: registrationId, name: p.name.trim(), relationship: p.relationship.trim() || null, phone: p.phone.trim() || null, notes: p.notes.trim() || null, created_by: session.user.id, updated_by: session.user.id }))
    const { error: pickupDeleteError } = await supabase.from('child_authorized_pickups').delete().eq('registration_id', registrationId)
    if (pickupDeleteError) { setMessage(pickupDeleteError.message); setSaving(false); return }
    if (pickupRows.length > 0) { const { error } = await supabase.from('child_authorized_pickups').insert(pickupRows); if (error) { setMessage(error.message); setSaving(false); return } }

    const agreementValues = [form.media_consent, form.program_consent, form.removal_acknowledgment, form.rules_acknowledgment, form.friday_acknowledgment, form.info_accuracy_acknowledgment]
    const hasAgreement = agreementValues.some(Boolean) || Boolean(form.signature_name.trim() || form.signature_date || form.terms_version.trim())
    if (hasAgreement) {
      const { error } = await supabase.from('child_registration_agreements').upsert({ registration_id: registrationId, media_consent: formToConsent(form.media_consent), program_consent: formToConsent(form.program_consent), removal_acknowledgment: formToConsent(form.removal_acknowledgment), rules_acknowledgment: formToConsent(form.rules_acknowledgment), friday_participation_acknowledgment: formToConsent(form.friday_acknowledgment), info_accuracy_acknowledgment: formToConsent(form.info_accuracy_acknowledgment), signature_name: form.signature_name.trim() || null, signature_date: form.signature_date || null, terms_version: form.terms_version.trim() || null, created_by: session.user.id, updated_by: session.user.id }, { onConflict: 'registration_id' })
      if (error) { setMessage(error.message); setSaving(false); return }
    } else if (agreementByRegistration.has(registrationId)) {
      const { error } = await supabase.from('child_registration_agreements').delete().eq('registration_id', registrationId)
      if (error) { setMessage(error.message); setSaving(false); return }
    }

    setSaving(false); setEditing(false); setMessage('Child registration saved securely.'); await loadData()
  }

  if (loading && !session) return <main className="login-wrap"><div className="card login-card">Loading children…</div></main>
  if (!session) return <main className="login-wrap"><section className="card login-card"><h1>Children</h1><p className="subtle">Sign in through Juanita Hub to view child profiles.</p></section></main>
  if (!profile?.active) return <main className="login-wrap"><section className="card login-card"><h1>Children</h1><div className="notice">Your staff account must be active before child profiles are available.</div></section></main>

  const selectedRegistration = selectedChild ? registrationByChild.get(selectedChild.id) : undefined
  const selectedContacts = selectedRegistration ? guardiansByRegistration.get(selectedRegistration.id) ?? [] : []
  const selectedPrimary = selectedContacts.find((g) => g.is_primary)
  const selectedEmergency = selectedContacts.find((g) => g.is_emergency && !g.is_primary) ?? selectedContacts.find((g) => g.is_emergency)
  const selectedHealth = selectedRegistration ? healthByRegistration.get(selectedRegistration.id) : undefined
  const selectedPickups = selectedRegistration ? pickupsByRegistration.get(selectedRegistration.id) ?? [] : []
  const selectedAgreement = selectedRegistration ? agreementByRegistration.get(selectedRegistration.id) : undefined

  const consentSelect = (label: string, key: keyof Pick<ProfileForm, 'media_consent'|'program_consent'|'removal_acknowledgment'|'rules_acknowledgment'|'friday_acknowledgment'|'info_accuracy_acknowledgment'>) => (
    <label className="field"><span>{label}</span><select value={form[key]} onChange={(e) => setForm((c) => ({ ...c, [key]: e.target.value as ConsentValue }))}><option value="">Not recorded</option><option value="yes">Agree</option><option value="no">Do not agree</option></select></label>
  )

  return <div className="shell">
    <header className="topbar"><div className="brand">Juanita Hub<small>Children & Registrations</small></div><div className="toolbar"><span>{profile.display_name} <span className="badge">{profile.role}</span></span></div></header>
    <main className="main children-page">
      <section className="hero children-hero"><div><span className="children-eyebrow">People</span><h1>Children & Registrations</h1><p className="subtle">School-year profiles, schedules, contacts, safety information, dismissal plans, and registration permissions in one place.</p></div><div className="children-security-pill">🔒 Sensitive details restricted</div></section>
      {message && <div className="notice">{message}</div>}
      <section className="card children-directory-toolbar"><label className="children-search"><span>Search children</span><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, school, or grade…" /></label><div className="children-directory-count"><strong>{visibleChildren.length}</strong><span>of {children.length} active children</span></div></section>
      <section className="children-grid">{visibleChildren.map((child) => { const r = registrationByChild.get(child.id); const age = calculateAge(r?.birth_date ?? null); return <button type="button" className="card child-profile-card" key={child.id} onClick={() => setSelectedChild(child)}><span className="child-profile-avatar">{child.first_name[0]?.toUpperCase()}</span><span className="child-profile-card-copy"><strong>{childName(child)}</strong>{r ? <><small>{[r.grade ? `Grade ${r.grade}` : '', r.school ?? ''].filter(Boolean).join(' • ') || 'School details not added'}</small><span>{formatBirthday(r.birth_date)}{age != null ? ` • Age ${age}` : ''}</span></> : <><small>No current registration</small><span>Open profile to add school-year details</span></>}</span><span className={`child-registration-status ${r ? 'current' : 'missing'}`}>{r ? 'Current' : 'Needs registration'}</span></button> })}</section>
      {visibleChildren.length === 0 && <section className="card children-empty">No children match that search.</section>}
      <section className="card children-retention-note"><strong>School-year privacy</strong><p>Annual registrations are separate from the permanent child roster so old family, health, schedule, dismissal, and consent information can later be expired and purged under the center’s retention policy.</p></section>
    </main>

    {selectedChild && !editing && <div className="children-modal-backdrop" role="presentation" onClick={closeProfile}><section className="card children-profile-modal" role="dialog" aria-modal="true" aria-labelledby="child-profile-title" onClick={(e) => e.stopPropagation()}><button type="button" className="children-modal-close" onClick={closeProfile}>×</button>
      <div className="children-profile-heading"><span className="child-profile-avatar large">{selectedChild.first_name[0]?.toUpperCase()}</span><div><span className="children-eyebrow">Child profile</span><h2 id="child-profile-title">{childName(selectedChild)}</h2><p>{selectedRegistration ? `${selectedRegistration.school_year} registration` : 'No current school-year registration yet'}</p></div>{profile.role === 'admin' && <button type="button" className="primary" onClick={() => openEditor(selectedChild)}>{selectedRegistration ? 'Edit registration' : 'Add registration'}</button>}</div>
      <div className="children-profile-sections">
        <section className="children-profile-section"><div className="children-section-title"><span>🎓</span><div><small>Overview</small><h3>School-year registration</h3></div></div><div className="children-facts-grid"><div><small>Birthday</small><strong>{formatBirthday(selectedRegistration?.birth_date ?? null)}</strong></div><div><small>Age</small><strong>{calculateAge(selectedRegistration?.birth_date ?? null) ?? '—'}</strong></div><div><small>School</small><strong>{selectedRegistration?.school || 'Not added'}</strong></div><div><small>Grade</small><strong>{selectedRegistration?.grade || 'Not added'}</strong></div><div><small>School year</small><strong>{selectedRegistration?.school_year || 'Not added'}</strong></div><div><small>Expected days</small><strong>{selectedRegistration?.attendance_days?.length ? selectedRegistration.attendance_days.map((d) => d.slice(0,3)).join(', ') : 'Not recorded'}</strong></div></div></section>
        <section className="children-profile-section"><div className="children-section-title"><span>🗓️</span><div><small>Schedule & dismissal</small><h3>Daily plan</h3></div></div><div className="children-facts-grid"><div><small>Other after-school program</small><strong>{selectedRegistration ? (selectedRegistration.attends_other_program ? 'Yes' : 'No') : '—'}</strong></div><div><small>Arrival notes</small><strong>{selectedRegistration?.other_program_arrival_notes || 'None'}</strong></div><div><small>Dismissal plan</small><strong>{dismissalLabel(selectedRegistration?.dismissal_plan ?? null)}</strong></div></div>{selectedRegistration?.dismissal_notes && <div className="children-care-notes"><small>Dismissal notes</small><p>{selectedRegistration.dismissal_notes}</p></div>}</section>
        {profile.role === 'admin' ? <>
          <section className="children-profile-section sensitive"><div className="children-section-title"><span>☎️</span><div><small>Restricted</small><h3>Family & emergency contacts</h3></div></div><div className="children-contact-grid"><article><small>Primary parent / guardian</small><strong>{selectedPrimary?.name || 'Not added'}</strong><span>{selectedPrimary?.relationship || ''}</span>{selectedPrimary?.phone && <a href={`tel:${selectedPrimary.phone}`}>{selectedPrimary.phone}</a>}{selectedPrimary?.secondary_phone && <span>{selectedPrimary.secondary_phone}</span>}{selectedPrimary?.email && <a href={`mailto:${selectedPrimary.email}`}>{selectedPrimary.email}</a>} {selectedPrimary?.preferred_contact && <span>Prefers {selectedPrimary.preferred_contact}</span>} {selectedPrimary?.address && <span>{selectedPrimary.address}</span>}</article><article><small>Emergency contact</small><strong>{selectedEmergency?.name || 'Not added'}</strong><span>{selectedEmergency?.relationship || ''}</span>{selectedEmergency?.phone && <a href={`tel:${selectedEmergency.phone}`}>{selectedEmergency.phone}</a>}</article></div></section>
          <section className="children-profile-section sensitive"><div className="children-section-title"><span>🚪</span><div><small>Restricted</small><h3>Authorized pickup people</h3></div></div>{selectedPickups.length ? <div className="children-contact-grid">{selectedPickups.map((p) => <article key={p.id}><small>Authorized pickup</small><strong>{p.name}</strong><span>{p.relationship || ''}</span>{p.phone && <a href={`tel:${p.phone}`}>{p.phone}</a>}{p.notes && <span>{p.notes}</span>}</article>)}</div> : <div className="children-empty-inline">No authorized pickup people listed.</div>}</section>
          <section className="children-profile-section sensitive health"><div className="children-section-title"><span>⚕️</span><div><small>Restricted</small><h3>Safety & support</h3></div></div><div className="children-support-grid"><div><small>Allergies</small><strong>{selectedHealth?.allergies || 'None entered'}</strong></div><div><small>Medical conditions</small><strong>{selectedHealth?.medical_conditions || 'None entered'}</strong></div><div><small>IEP / learning support</small><strong>{selectedHealth?.learning_support || 'None entered'}</strong></div><div><small>Behavioral support</small><strong>{selectedHealth?.behavioral_support || 'None entered'}</strong></div></div>{selectedHealth?.actions_to_take && <div className="children-care-notes important"><small>Actions staff should take</small><p>{selectedHealth.actions_to_take}</p></div>}{selectedHealth?.important_care_notes && <div className="children-care-notes"><small>Other important care notes</small><p>{selectedHealth.important_care_notes}</p></div>}</section>
          <section className="children-profile-section sensitive"><div className="children-section-title"><span>✍️</span><div><small>Restricted</small><h3>Permissions & agreements</h3></div></div>{selectedAgreement ? <div className="children-agreement-grid"><div><small>Media</small><strong>{selectedAgreement.media_consent == null ? 'Not recorded' : selectedAgreement.media_consent ? 'Agreed' : 'Did not agree'}</strong></div><div><small>Program consent</small><strong>{selectedAgreement.program_consent == null ? 'Not recorded' : selectedAgreement.program_consent ? 'Agreed' : 'Did not agree'}</strong></div><div><small>Removal acknowledgment</small><strong>{selectedAgreement.removal_acknowledgment == null ? 'Not recorded' : selectedAgreement.removal_acknowledgment ? 'Agreed' : 'Did not agree'}</strong></div><div><small>Rules</small><strong>{selectedAgreement.rules_acknowledgment == null ? 'Not recorded' : selectedAgreement.rules_acknowledgment ? 'Agreed' : 'Did not agree'}</strong></div><div><small>Friday requirement</small><strong>{selectedAgreement.friday_participation_acknowledgment == null ? 'Not recorded' : selectedAgreement.friday_participation_acknowledgment ? 'Agreed' : 'Did not agree'}</strong></div><div><small>Keep info current</small><strong>{selectedAgreement.info_accuracy_acknowledgment == null ? 'Not recorded' : selectedAgreement.info_accuracy_acknowledgment ? 'Agreed' : 'Did not agree'}</strong></div><div><small>Signed by</small><strong>{selectedAgreement.signature_name || 'Not recorded'}</strong></div><div><small>Signature date</small><strong>{selectedAgreement.signature_date || 'Not recorded'}</strong></div></div> : <div className="children-empty-inline">No agreement record entered yet.</div>}</section>
        </> : <section className="children-profile-section locked"><div className="children-section-title"><span>🔒</span><div><small>Restricted information</small><h3>Contacts, safety & registration permissions</h3></div></div><p>Family contacts, emergency contacts, health/support details, pickup permissions, and signed agreements are restricted to admins in this first version.</p></section>}
      </div>
    </section></div>}

    {selectedChild && editing && profile.role === 'admin' && <div className="children-modal-backdrop" role="presentation" onClick={() => !saving && setEditing(false)}><section className="card children-profile-modal editor" role="dialog" aria-modal="true" aria-labelledby="child-editor-title" onClick={(e) => e.stopPropagation()}><button type="button" className="children-modal-close" onClick={() => !saving && setEditing(false)}>×</button><span className="children-eyebrow">Secure annual registration</span><h2 id="child-editor-title">{childName(selectedChild)}</h2><p className="subtle">Enter only the information supplied for this school year. Blank consent answers remain “Not recorded.”</p>
      <div className="children-form-section"><div className="children-section-title"><span>🎓</span><div><small>Overview</small><h3>Child & school</h3></div></div><div className="children-form-grid"><label className="field"><span>School year</span><input value={form.school_year} onChange={(e) => setForm((c) => ({ ...c, school_year: e.target.value }))} /></label><label className="field"><span>Birthday</span><input type="date" value={form.birth_date} onChange={(e) => setForm((c) => ({ ...c, birth_date: e.target.value }))} /></label><label className="field"><span>School</span><input value={form.school} onChange={(e) => setForm((c) => ({ ...c, school: e.target.value }))} /></label><label className="field"><span>Grade</span><input value={form.grade} onChange={(e) => setForm((c) => ({ ...c, grade: e.target.value }))} /></label><label className="children-public-birthday"><input type="checkbox" checked={form.show_birthday_publicly} onChange={(e) => setForm((c) => ({ ...c, show_birthday_publicly: e.target.checked }))} /><span><strong>Show birthday on welcome board</strong><small>Only first name and birthday celebration are exposed to the kiosk.</small></span></label></div></div>
      <div className="children-form-section"><div className="children-section-title"><span>🗓️</span><div><small>Schedule & dismissal</small><h3>Expected routine</h3></div></div><div className="children-weekdays">{weekdays.map((day) => <label key={day}><input type="checkbox" checked={form.attendance_days.includes(day)} onChange={() => toggleDay(day)} /><span>{day.slice(0,3)}</span></label>)}</div><div className="children-form-grid"><label className="children-toggle-line"><input type="checkbox" checked={form.attends_other_program} onChange={(e) => setForm((c) => ({ ...c, attends_other_program: e.target.checked }))} /><span>Child also attends another after-school or sports program</span></label>{form.attends_other_program && <label className="field"><span>Expected arrival / schedule notes</span><textarea rows={2} value={form.other_program_arrival_notes} onChange={(e) => setForm((c) => ({ ...c, other_program_arrival_notes: e.target.value }))} /></label>}<label className="field"><span>Dismissal plan</span><select value={form.dismissal_plan} onChange={(e) => setForm((c) => ({ ...c, dismissal_plan: e.target.value }))}>{dismissalOptions.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label><label className="field"><span>Dismissal notes</span><textarea rows={2} value={form.dismissal_notes} onChange={(e) => setForm((c) => ({ ...c, dismissal_notes: e.target.value }))} placeholder="Names, exceptions, or details from the registration form" /></label></div></div>
      <div className="children-form-section restricted"><div className="children-section-title"><span>🔒</span><div><small>Restricted</small><h3>Parent / guardian</h3></div></div><div className="children-form-grid three"><label className="field"><span>Name</span><input value={form.primary_name} onChange={(e) => setForm((c) => ({ ...c, primary_name: e.target.value }))} /></label><label className="field"><span>Relationship</span><input value={form.primary_relationship} onChange={(e) => setForm((c) => ({ ...c, primary_relationship: e.target.value }))} /></label><label className="field"><span>Mobile phone</span><input type="tel" value={form.primary_phone} onChange={(e) => setForm((c) => ({ ...c, primary_phone: e.target.value }))} /></label><label className="field"><span>Other phone</span><input type="tel" value={form.primary_secondary_phone} onChange={(e) => setForm((c) => ({ ...c, primary_secondary_phone: e.target.value }))} /></label><label className="field"><span>Email</span><input type="email" value={form.primary_email} onChange={(e) => setForm((c) => ({ ...c, primary_email: e.target.value }))} /></label><label className="field"><span>Preferred contact</span><select value={form.preferred_contact} onChange={(e) => setForm((c) => ({ ...c, preferred_contact: e.target.value }))}><option value="">Not recorded</option><option>Phone</option><option>Text Message</option><option>Email</option></select></label><label className="field children-wide"><span>Current address</span><input value={form.primary_address} onChange={(e) => setForm((c) => ({ ...c, primary_address: e.target.value }))} /></label></div></div>
      <div className="children-form-section restricted"><div className="children-section-title"><span>🚨</span><div><small>Restricted</small><h3>Emergency contact</h3></div></div><div className="children-form-grid three"><label className="field"><span>Name</span><input value={form.emergency_name} onChange={(e) => setForm((c) => ({ ...c, emergency_name: e.target.value }))} /></label><label className="field"><span>Relationship</span><input value={form.emergency_relationship} onChange={(e) => setForm((c) => ({ ...c, emergency_relationship: e.target.value }))} /></label><label className="field"><span>Phone</span><input type="tel" value={form.emergency_phone} onChange={(e) => setForm((c) => ({ ...c, emergency_phone: e.target.value }))} /></label></div></div>
      <div className="children-form-section restricted"><div className="children-section-title"><span>🚪</span><div><small>Restricted</small><h3>Authorized pickup people</h3></div></div><div className="children-pickup-editor">{form.authorized_pickups.map((p, i) => <div className="children-pickup-row" key={i}><input aria-label="Pickup person name" placeholder="Name" value={p.name} onChange={(e) => updatePickup(i,'name',e.target.value)} /><input aria-label="Relationship" placeholder="Relationship" value={p.relationship} onChange={(e) => updatePickup(i,'relationship',e.target.value)} /><input aria-label="Phone" placeholder="Phone" value={p.phone} onChange={(e) => updatePickup(i,'phone',e.target.value)} /><input aria-label="Notes" placeholder="Notes" value={p.notes} onChange={(e) => updatePickup(i,'notes',e.target.value)} /><button type="button" className="ghost" onClick={() => setForm((c) => ({ ...c, authorized_pickups: c.authorized_pickups.filter((_,x) => x !== i) }))}>Remove</button></div>)}<button type="button" className="ghost children-add-pickup" onClick={() => setForm((c) => ({ ...c, authorized_pickups: [...c.authorized_pickups, emptyPickup()] }))}>+ Add authorized pickup</button></div></div>
      <div className="children-form-section restricted health"><div className="children-section-title"><span>⚕️</span><div><small>Restricted</small><h3>Safety & support</h3></div></div><div className="children-form-grid"><label className="field"><span>Allergies</span><textarea rows={3} value={form.allergies} onChange={(e) => setForm((c) => ({ ...c, allergies: e.target.value }))} /></label><label className="field"><span>Medical conditions</span><textarea rows={3} value={form.medical_conditions} onChange={(e) => setForm((c) => ({ ...c, medical_conditions: e.target.value }))} /></label><label className="field"><span>IEP / learning support</span><textarea rows={3} value={form.learning_support} onChange={(e) => setForm((c) => ({ ...c, learning_support: e.target.value }))} /></label><label className="field"><span>Behavioral support</span><textarea rows={3} value={form.behavioral_support} onChange={(e) => setForm((c) => ({ ...c, behavioral_support: e.target.value }))} /></label><label className="field children-wide"><span>Actions staff should take</span><textarea rows={3} value={form.actions_to_take} onChange={(e) => setForm((c) => ({ ...c, actions_to_take: e.target.value }))} placeholder="What should staff do if this need comes up?" /></label><label className="field children-wide"><span>Other important care notes</span><textarea rows={3} value={form.important_care_notes} onChange={(e) => setForm((c) => ({ ...c, important_care_notes: e.target.value }))} /></label></div></div>
      <div className="children-form-section restricted"><div className="children-section-title"><span>✍️</span><div><small>Restricted</small><h3>Permissions & agreements</h3></div></div><p className="subtle children-form-note">Use “Not recorded” when a response was blank or is not available. Do not infer consent.</p><div className="children-form-grid three">{consentSelect('Media/photo permission','media_consent')}{consentSelect('Program participation consent','program_consent')}{consentSelect('Removal/responsibility acknowledgment','removal_acknowledgment')}{consentSelect('Rules & expectations acknowledgment','rules_acknowledgment')}{consentSelect('Friday participation requirement','friday_acknowledgment')}{consentSelect('Keep information current','info_accuracy_acknowledgment')}<label className="field"><span>Electronic signature</span><input value={form.signature_name} onChange={(e) => setForm((c) => ({ ...c, signature_name: e.target.value }))} /></label><label className="field"><span>Signature date</span><input type="date" value={form.signature_date} onChange={(e) => setForm((c) => ({ ...c, signature_date: e.target.value }))} /></label><label className="field"><span>Agreement form / version</span><input value={form.terms_version} onChange={(e) => setForm((c) => ({ ...c, terms_version: e.target.value }))} placeholder="2026-2027" /></label></div></div>
      <div className="children-editor-actions"><button type="button" className="ghost" onClick={() => setEditing(false)} disabled={saving}>Cancel</button><button type="button" className="primary" onClick={() => void saveProfile()} disabled={saving}>{saving ? 'Saving securely…' : 'Save registration'}</button></div>
    </section></div>}
  </div>
}
