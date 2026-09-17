'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type StaffProfile = {
  display_name: string
  role: 'staff' | 'admin'
  active: boolean
}

type Child = {
  id: number
  first_name: string
  last_name: string | null
  active: boolean
}

type Registration = {
  id: number
  child_id: number
  school_year: string
  birth_date: string | null
  school: string | null
  grade: string | null
  status: 'active' | 'expired'
  show_birthday_publicly: boolean
}

type Guardian = {
  id: number
  registration_id: number
  name: string
  relationship: string | null
  phone: string | null
  email: string | null
  is_primary: boolean
  is_emergency: boolean
  authorized_pickup: boolean
  notes: string | null
}

type HealthInfo = {
  registration_id: number
  allergies: string | null
  important_care_notes: string | null
}

type ProfileForm = {
  school_year: string
  birth_date: string
  school: string
  grade: string
  show_birthday_publicly: boolean
  primary_name: string
  primary_relationship: string
  primary_phone: string
  emergency_name: string
  emergency_relationship: string
  emergency_phone: string
  allergies: string
  important_care_notes: string
}

function childName(child: Child) {
  return `${child.first_name}${child.last_name ? ` ${child.last_name}` : ''}`
}

function currentSchoolYear() {
  const now = new Date()
  const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
  return `${startYear}-${startYear + 1}`
}

function calculateAge(birthDate: string | null) {
  if (!birthDate) return null
  const birth = new Date(`${birthDate}T12:00:00`)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1
  return age
}

function formatBirthday(birthDate: string | null) {
  if (!birthDate) return 'Not added'
  return new Date(`${birthDate}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
}

function blankForm(): ProfileForm {
  return {
    school_year: currentSchoolYear(),
    birth_date: '',
    school: '',
    grade: '',
    show_birthday_publicly: true,
    primary_name: '',
    primary_relationship: '',
    primary_phone: '',
    emergency_name: '',
    emergency_relationship: '',
    emergency_phone: '',
    allergies: '',
    important_care_notes: '',
  }
}

export default function ChildrenPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [children, setChildren] = useState<Child[]>([])
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [guardians, setGuardians] = useState<Guardian[]>([])
  const [healthInfo, setHealthInfo] = useState<HealthInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [selectedChild, setSelectedChild] = useState<Child | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<ProfileForm>(blankForm())

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
    if (!session) {
      setProfile(null)
      return
    }
    void loadData()
  }, [session])

  async function loadData() {
    if (!session) return
    setLoading(true)
    setMessage('')

    const [profileResult, childrenResult, registrationsResult] = await Promise.all([
      supabase.from('staff_profiles').select('display_name, role, active').eq('user_id', session.user.id).maybeSingle(),
      supabase.from('children').select('id, first_name, last_name, active').eq('active', true).order('first_name').order('last_name'),
      supabase.from('child_registrations').select('id, child_id, school_year, birth_date, school, grade, status, show_birthday_publicly').eq('status', 'active'),
    ])

    const nextProfile = profileResult.data as StaffProfile | null
    const nextRegistrations = (registrationsResult.data ?? []) as Registration[]

    setProfile(nextProfile)
    setChildren((childrenResult.data ?? []) as Child[])
    setRegistrations(nextRegistrations)

    let nextGuardians: Guardian[] = []
    let nextHealth: HealthInfo[] = []

    if (nextProfile?.role === 'admin' && nextRegistrations.length > 0) {
      const ids = nextRegistrations.map((registration) => registration.id)
      const [guardiansResult, healthResult] = await Promise.all([
        supabase.from('child_guardians').select('id, registration_id, name, relationship, phone, email, is_primary, is_emergency, authorized_pickup, notes').in('registration_id', ids).order('is_primary', { ascending: false }),
        supabase.from('child_health_info').select('registration_id, allergies, important_care_notes').in('registration_id', ids),
      ])

      nextGuardians = (guardiansResult.data ?? []) as Guardian[]
      nextHealth = (healthResult.data ?? []) as HealthInfo[]
      if (guardiansResult.error || healthResult.error) {
        setMessage(guardiansResult.error?.message ?? healthResult.error?.message ?? '')
      }
    }

    setGuardians(nextGuardians)
    setHealthInfo(nextHealth)
    setMessage((current) => current || profileResult.error?.message || childrenResult.error?.message || registrationsResult.error?.message || '')
    setLoading(false)
  }

  const registrationByChild = useMemo(() => new Map(registrations.map((registration) => [registration.child_id, registration])), [registrations])
  const guardiansByRegistration = useMemo(() => {
    const map = new Map<number, Guardian[]>()
    guardians.forEach((guardian) => map.set(guardian.registration_id, [...(map.get(guardian.registration_id) ?? []), guardian]))
    return map
  }, [guardians])
  const healthByRegistration = useMemo(() => new Map(healthInfo.map((item) => [item.registration_id, item])), [healthInfo])

  const visibleChildren = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return children
    return children.filter((child) => {
      const registration = registrationByChild.get(child.id)
      return [childName(child), registration?.school ?? '', registration?.grade ?? ''].some((value) => value.toLowerCase().includes(query))
    })
  }, [children, registrationByChild, search])

  function closeProfile() {
    if (saving) return
    setSelectedChild(null)
    setEditing(false)
  }

  function openEditor(child: Child) {
    if (profile?.role !== 'admin') return
    const registration = registrationByChild.get(child.id)
    const contactRows = registration ? guardiansByRegistration.get(registration.id) ?? [] : []
    const primary = contactRows.find((guardian) => guardian.is_primary)
    const emergency = contactRows.find((guardian) => guardian.is_emergency && !guardian.is_primary) ?? contactRows.find((guardian) => guardian.is_emergency)
    const health = registration ? healthByRegistration.get(registration.id) : undefined

    setForm({
      school_year: registration?.school_year ?? currentSchoolYear(),
      birth_date: registration?.birth_date ?? '',
      school: registration?.school ?? '',
      grade: registration?.grade ?? '',
      show_birthday_publicly: registration?.show_birthday_publicly ?? true,
      primary_name: primary?.name ?? '',
      primary_relationship: primary?.relationship ?? '',
      primary_phone: primary?.phone ?? '',
      emergency_name: emergency?.name ?? '',
      emergency_relationship: emergency?.relationship ?? '',
      emergency_phone: emergency?.phone ?? '',
      allergies: health?.allergies ?? '',
      important_care_notes: health?.important_care_notes ?? '',
    })
    setSelectedChild(child)
    setEditing(true)
    setMessage('')
  }

  async function saveProfile() {
    if (!session || !selectedChild || profile?.role !== 'admin' || saving) return
    if (!form.school_year.trim()) {
      setMessage('Enter the school year for this registration.')
      return
    }

    setSaving(true)
    setMessage('')

    let registration = registrationByChild.get(selectedChild.id)
    let registrationId = registration?.id

    if (registration) {
      const { error } = await supabase.from('child_registrations').update({
        school_year: form.school_year.trim(),
        birth_date: form.birth_date || null,
        school: form.school.trim() || null,
        grade: form.grade.trim() || null,
        show_birthday_publicly: form.show_birthday_publicly,
      }).eq('id', registration.id)
      if (error) {
        setMessage(error.message)
        setSaving(false)
        return
      }
    } else {
      const { data, error } = await supabase.from('child_registrations').insert({
        child_id: selectedChild.id,
        school_year: form.school_year.trim(),
        birth_date: form.birth_date || null,
        school: form.school.trim() || null,
        grade: form.grade.trim() || null,
        status: 'active',
        show_birthday_publicly: form.show_birthday_publicly,
        created_by: session.user.id,
        updated_by: session.user.id,
      }).select('id, child_id, school_year, birth_date, school, grade, status, show_birthday_publicly').single()

      if (error || !data) {
        setMessage(error?.message ?? 'Registration could not be created.')
        setSaving(false)
        return
      }
      registration = data as Registration
      registrationId = registration.id
    }

    if (!registrationId) {
      setMessage('Registration could not be saved.')
      setSaving(false)
      return
    }

    const existingContacts = guardiansByRegistration.get(registrationId) ?? []
    const existingPrimary = existingContacts.find((guardian) => guardian.is_primary)
    const existingEmergency = existingContacts.find((guardian) => guardian.is_emergency && !guardian.is_primary) ?? existingContacts.find((guardian) => guardian.is_emergency)

    const saveContact = async (
      existing: Guardian | undefined,
      values: { name: string; relationship: string; phone: string },
      flags: { is_primary: boolean; is_emergency: boolean },
    ) => {
      const hasContent = Boolean(values.name.trim() || values.phone.trim() || values.relationship.trim())
      if (!hasContent && existing) return supabase.from('child_guardians').delete().eq('id', existing.id)
      if (!hasContent) return { error: null }

      const row = {
        registration_id: registrationId,
        name: values.name.trim() || (flags.is_emergency ? 'Emergency contact' : 'Parent / guardian'),
        relationship: values.relationship.trim() || null,
        phone: values.phone.trim() || null,
        is_primary: flags.is_primary,
        is_emergency: flags.is_emergency,
        authorized_pickup: false,
        created_by: session.user.id,
        updated_by: session.user.id,
      }

      if (existing) {
        return supabase.from('child_guardians').update({
          name: row.name,
          relationship: row.relationship,
          phone: row.phone,
          is_primary: row.is_primary,
          is_emergency: row.is_emergency,
        }).eq('id', existing.id)
      }
      return supabase.from('child_guardians').insert(row)
    }

    const primaryResult = await saveContact(existingPrimary, {
      name: form.primary_name,
      relationship: form.primary_relationship,
      phone: form.primary_phone,
    }, { is_primary: true, is_emergency: false })

    if (primaryResult.error) {
      setMessage(primaryResult.error.message)
      setSaving(false)
      return
    }

    const emergencyResult = await saveContact(existingEmergency, {
      name: form.emergency_name,
      relationship: form.emergency_relationship,
      phone: form.emergency_phone,
    }, { is_primary: false, is_emergency: true })

    if (emergencyResult.error) {
      setMessage(emergencyResult.error.message)
      setSaving(false)
      return
    }

    const existingHealth = healthByRegistration.get(registrationId)
    const hasHealth = Boolean(form.allergies.trim() || form.important_care_notes.trim())
    if (hasHealth) {
      const { error } = await supabase.from('child_health_info').upsert({
        registration_id: registrationId,
        allergies: form.allergies.trim() || null,
        important_care_notes: form.important_care_notes.trim() || null,
        created_by: session.user.id,
        updated_by: session.user.id,
      }, { onConflict: 'registration_id' })
      if (error) {
        setMessage(error.message)
        setSaving(false)
        return
      }
    } else if (existingHealth) {
      const { error } = await supabase.from('child_health_info').delete().eq('registration_id', registrationId)
      if (error) {
        setMessage(error.message)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setEditing(false)
    setMessage('Child registration saved securely.')
    await loadData()
  }

  if (loading && !session) {
    return <main className="login-wrap"><div className="card login-card">Loading children…</div></main>
  }

  if (!session) {
    return <main className="login-wrap"><section className="card login-card"><h1>Children</h1><p className="subtle">Sign in through Juanita Hub to view child profiles.</p></section></main>
  }

  if (!profile?.active) {
    return <main className="login-wrap"><section className="card login-card"><h1>Children</h1><div className="notice">Your staff account must be active before child profiles are available.</div></section></main>
  }

  const selectedRegistration = selectedChild ? registrationByChild.get(selectedChild.id) : undefined
  const selectedContacts = selectedRegistration ? guardiansByRegistration.get(selectedRegistration.id) ?? [] : []
  const selectedPrimary = selectedContacts.find((guardian) => guardian.is_primary)
  const selectedEmergency = selectedContacts.find((guardian) => guardian.is_emergency && !guardian.is_primary) ?? selectedContacts.find((guardian) => guardian.is_emergency)
  const selectedHealth = selectedRegistration ? healthByRegistration.get(selectedRegistration.id) : undefined

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Juanita Hub<small>Children & Registrations</small></div>
        <div className="toolbar"><span>{profile.display_name} <span className="badge">{profile.role}</span></span></div>
      </header>

      <main className="main children-page">
        <section className="hero children-hero">
          <div>
            <span className="children-eyebrow">People</span>
            <h1>Children & Registrations</h1>
            <p className="subtle">Find school-year information quickly. Contact, emergency, and allergy details are kept in a restricted section.</p>
          </div>
          <div className="children-security-pill">🔒 Sensitive details restricted</div>
        </section>

        {message && <div className="notice">{message}</div>}

        <section className="card children-directory-toolbar">
          <label className="children-search">
            <span>Search children</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, school, or grade…" />
          </label>
          <div className="children-directory-count"><strong>{visibleChildren.length}</strong><span>of {children.length} active children</span></div>
        </section>

        <section className="children-grid">
          {visibleChildren.map((child) => {
            const registration = registrationByChild.get(child.id)
            const age = calculateAge(registration?.birth_date ?? null)
            return (
              <button type="button" className="card child-profile-card" key={child.id} onClick={() => setSelectedChild(child)}>
                <span className="child-profile-avatar">{child.first_name.charAt(0).toUpperCase()}</span>
                <span className="child-profile-card-copy">
                  <strong>{childName(child)}</strong>
                  {registration ? (
                    <>
                      <small>{[registration.grade ? `Grade ${registration.grade}` : '', registration.school ?? ''].filter(Boolean).join(' • ') || 'School details not added'}</small>
                      <span>{formatBirthday(registration.birth_date)}{age != null ? ` • Age ${age}` : ''}</span>
                    </>
                  ) : (
                    <><small>No current registration</small><span>Open profile to add school-year details</span></>
                  )}
                </span>
                <span className={`child-registration-status ${registration ? 'current' : 'missing'}`}>{registration ? 'Current' : 'Needs registration'}</span>
              </button>
            )
          })}
        </section>

        {visibleChildren.length === 0 && <section className="card children-empty">No children match that search.</section>}

        <section className="card children-retention-note">
          <strong>School-year privacy</strong>
          <p>Annual registrations are separate from the permanent child roster. The future rollover tool will expire the old registration and handle sensitive-data purging according to the center’s chosen retention policy.</p>
        </section>
      </main>

      {selectedChild && !editing && (
        <div className="children-modal-backdrop" role="presentation" onClick={closeProfile}>
          <section className="card children-profile-modal" role="dialog" aria-modal="true" aria-labelledby="child-profile-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="children-modal-close" onClick={closeProfile} aria-label="Close profile">×</button>
            <div className="children-profile-heading">
              <span className="child-profile-avatar large">{selectedChild.first_name.charAt(0).toUpperCase()}</span>
              <div><span className="children-eyebrow">Child profile</span><h2 id="child-profile-title">{childName(selectedChild)}</h2><p>{selectedRegistration ? `${selectedRegistration.school_year} registration` : 'No current school-year registration yet'}</p></div>
              {profile.role === 'admin' && <button type="button" className="primary" onClick={() => openEditor(selectedChild)}>{selectedRegistration ? 'Edit profile' : 'Add registration'}</button>}
            </div>

            <div className="children-profile-sections">
              <section className="children-profile-section">
                <div className="children-section-title"><span>🎓</span><div><small>School-year basics</small><h3>Registration</h3></div></div>
                <div className="children-facts-grid">
                  <div><small>Birthday</small><strong>{formatBirthday(selectedRegistration?.birth_date ?? null)}</strong></div>
                  <div><small>Age</small><strong>{calculateAge(selectedRegistration?.birth_date ?? null) ?? '—'}</strong></div>
                  <div><small>School</small><strong>{selectedRegistration?.school || 'Not added'}</strong></div>
                  <div><small>Grade</small><strong>{selectedRegistration?.grade || 'Not added'}</strong></div>
                  <div><small>School year</small><strong>{selectedRegistration?.school_year || 'Not added'}</strong></div>
                  <div><small>Public birthday</small><strong>{selectedRegistration ? (selectedRegistration.show_birthday_publicly ? 'Yes' : 'No') : '—'}</strong></div>
                </div>
              </section>

              {profile.role === 'admin' ? (
                <>
                  <section className="children-profile-section sensitive">
                    <div className="children-section-title"><span>☎️</span><div><small>Restricted</small><h3>Parent & emergency contacts</h3></div></div>
                    <div className="children-contact-grid">
                      <article><small>Primary parent / guardian</small><strong>{selectedPrimary?.name || 'Not added'}</strong><span>{selectedPrimary?.relationship || ''}</span>{selectedPrimary?.phone && <a href={`tel:${selectedPrimary.phone}`}>{selectedPrimary.phone}</a>}</article>
                      <article><small>Emergency contact</small><strong>{selectedEmergency?.name || 'Not added'}</strong><span>{selectedEmergency?.relationship || ''}</span>{selectedEmergency?.phone && <a href={`tel:${selectedEmergency.phone}`}>{selectedEmergency.phone}</a>}</article>
                    </div>
                  </section>

                  <section className="children-profile-section sensitive health">
                    <div className="children-section-title"><span>⚕️</span><div><small>Restricted</small><h3>Allergies & important care information</h3></div></div>
                    <div className={`children-health-alert ${selectedHealth?.allergies ? 'has-info' : ''}`}><small>Allergies</small><strong>{selectedHealth?.allergies || 'No allergy information entered'}</strong></div>
                    {selectedHealth?.important_care_notes && <div className="children-care-notes"><small>Important care notes</small><p>{selectedHealth.important_care_notes}</p></div>}
                  </section>
                </>
              ) : (
                <section className="children-profile-section locked">
                  <div className="children-section-title"><span>🔒</span><div><small>Restricted information</small><h3>Contacts & health details</h3></div></div>
                  <p>Parent phone numbers, emergency contacts, allergies, and care notes are restricted to admins in this first version.</p>
                </section>
              )}
            </div>
          </section>
        </div>
      )}

      {selectedChild && editing && profile.role === 'admin' && (
        <div className="children-modal-backdrop" role="presentation" onClick={() => !saving && setEditing(false)}>
          <section className="card children-profile-modal editor" role="dialog" aria-modal="true" aria-labelledby="child-editor-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="children-modal-close" onClick={() => !saving && setEditing(false)} aria-label="Close editor">×</button>
            <span className="children-eyebrow">Secure annual registration</span>
            <h2 id="child-editor-title">{childName(selectedChild)}</h2>
            <p className="subtle">Only the school-year basics appear in the regular directory. Contact and health fields below are restricted.</p>

            <div className="children-form-grid">
              <label className="field"><span>School year</span><input value={form.school_year} onChange={(event) => setForm((current) => ({ ...current, school_year: event.target.value }))} placeholder="2026-2027" /></label>
              <label className="field"><span>Birthday</span><input type="date" value={form.birth_date} onChange={(event) => setForm((current) => ({ ...current, birth_date: event.target.value }))} /></label>
              <label className="field"><span>School</span><input value={form.school} onChange={(event) => setForm((current) => ({ ...current, school: event.target.value }))} /></label>
              <label className="field"><span>Grade</span><input value={form.grade} onChange={(event) => setForm((current) => ({ ...current, grade: event.target.value }))} placeholder="5" /></label>
              <label className="children-public-birthday"><input type="checkbox" checked={form.show_birthday_publicly} onChange={(event) => setForm((current) => ({ ...current, show_birthday_publicly: event.target.checked }))} /><span><strong>Show birthday on welcome board</strong><small>Only the child’s first name and birthday celebration will be shown publicly—not their age or birth year.</small></span></label>
            </div>

            <div className="children-form-section restricted">
              <div className="children-section-title"><span>🔒</span><div><small>Restricted</small><h3>Parent / guardian</h3></div></div>
              <div className="children-form-grid three">
                <label className="field"><span>Name</span><input value={form.primary_name} onChange={(event) => setForm((current) => ({ ...current, primary_name: event.target.value }))} /></label>
                <label className="field"><span>Relationship</span><input value={form.primary_relationship} onChange={(event) => setForm((current) => ({ ...current, primary_relationship: event.target.value }))} placeholder="Mother, father, guardian…" /></label>
                <label className="field"><span>Phone</span><input type="tel" value={form.primary_phone} onChange={(event) => setForm((current) => ({ ...current, primary_phone: event.target.value }))} /></label>
              </div>
            </div>

            <div className="children-form-section restricted">
              <div className="children-section-title"><span>🚨</span><div><small>Restricted</small><h3>Emergency contact</h3></div></div>
              <div className="children-form-grid three">
                <label className="field"><span>Name</span><input value={form.emergency_name} onChange={(event) => setForm((current) => ({ ...current, emergency_name: event.target.value }))} /></label>
                <label className="field"><span>Relationship</span><input value={form.emergency_relationship} onChange={(event) => setForm((current) => ({ ...current, emergency_relationship: event.target.value }))} /></label>
                <label className="field"><span>Phone</span><input type="tel" value={form.emergency_phone} onChange={(event) => setForm((current) => ({ ...current, emergency_phone: event.target.value }))} /></label>
              </div>
            </div>

            <div className="children-form-section restricted health">
              <div className="children-section-title"><span>⚕️</span><div><small>Restricted</small><h3>Allergies & care information</h3></div></div>
              <div className="children-form-grid">
                <label className="field"><span>Allergies</span><textarea rows={3} value={form.allergies} onChange={(event) => setForm((current) => ({ ...current, allergies: event.target.value }))} placeholder="Food, medication, environmental allergies…" /></label>
                <label className="field"><span>Important care notes</span><textarea rows={3} value={form.important_care_notes} onChange={(event) => setForm((current) => ({ ...current, important_care_notes: event.target.value }))} placeholder="Only information staff truly need for safe care." /></label>
              </div>
            </div>

            <div className="children-editor-actions"><button type="button" className="ghost" onClick={() => setEditing(false)} disabled={saving}>Cancel</button><button type="button" className="primary" onClick={() => void saveProfile()} disabled={saving}>{saving ? 'Saving securely…' : 'Save registration'}</button></div>
          </section>
        </div>
      )}
    </div>
  )
}
