'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type StaffProfile = { display_name: string; role: 'staff' | 'admin'; active: boolean }
type Child = { id: number; first_name: string; last_name: string | null }
type Household = { id: number; display_name: string; status: 'active' | 'inactive' | 'archived'; last_program_activity_on: string | null }
type HouseholdChild = { household_id: number; child_id: number; is_primary: boolean; active: boolean }
type HouseholdContact = {
  id: number
  household_id: number
  name: string
  relationship: string | null
  email: string | null
  phone: string | null
  other_phone: string | null
  address: string | null
  preferred_contact: 'phone' | 'text' | 'email' | 'whatsapp' | 'other' | null
  is_primary: boolean
  active: boolean
}

type ContactForm = {
  id: number | null
  name: string
  relationship: string
  email: string
  phone: string
  other_phone: string
  address: string
  preferred_contact: '' | 'phone' | 'text' | 'email' | 'whatsapp' | 'other'
  is_primary: boolean
}

const blankContact: ContactForm = {
  id: null,
  name: '',
  relationship: '',
  email: '',
  phone: '',
  other_phone: '',
  address: '',
  preferred_contact: '',
  is_primary: false,
}

function fullName(child: Child) {
  return `${child.first_name}${child.last_name ? ` ${child.last_name}` : ''}`
}

export default function HouseholdsPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [households, setHouseholds] = useState<Household[]>([])
  const [links, setLinks] = useState<HouseholdChild[]>([])
  const [children, setChildren] = useState<Child[]>([])
  const [contacts, setContacts] = useState<HouseholdContact[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [newHouseholdName, setNewHouseholdName] = useState('')
  const [childToAdd, setChildToAdd] = useState('')
  const [contactForm, setContactForm] = useState<ContactForm>(blankContact)
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

    const [profileResult, householdsResult, linksResult, childrenResult] = await Promise.all([
      supabase.from('staff_profiles').select('display_name, role, active').eq('user_id', session.user.id).maybeSingle(),
      supabase.from('households').select('id, display_name, status, last_program_activity_on').order('display_name'),
      supabase.from('household_children').select('household_id, child_id, is_primary, active').eq('active', true),
      supabase.from('children').select('id, first_name, last_name').eq('active', true).order('first_name').order('last_name'),
    ])

    const nextProfile = profileResult.data as StaffProfile | null
    setProfile(nextProfile)
    setHouseholds((householdsResult.data ?? []) as Household[])
    setLinks((linksResult.data ?? []) as HouseholdChild[])
    setChildren((childrenResult.data ?? []) as Child[])

    if (nextProfile?.role === 'admin') {
      const contactsResult = await supabase
        .from('household_contacts')
        .select('id, household_id, name, relationship, email, phone, other_phone, address, preferred_contact, is_primary, active')
        .eq('active', true)
        .order('is_primary', { ascending: false })
        .order('name')
      setContacts((contactsResult.data ?? []) as HouseholdContact[])
      if (contactsResult.error) setMessage(contactsResult.error.message)
    } else {
      setContacts([])
    }

    setMessage((current) => current || profileResult.error?.message || householdsResult.error?.message || linksResult.error?.message || childrenResult.error?.message || '')
    setLoading(false)
  }

  const childById = useMemo(() => new Map(children.map((child) => [child.id, child])), [children])
  const linksByHousehold = useMemo(() => {
    const map = new Map<number, HouseholdChild[]>()
    for (const link of links) map.set(link.household_id, [...(map.get(link.household_id) ?? []), link])
    return map
  }, [links])
  const contactsByHousehold = useMemo(() => {
    const map = new Map<number, HouseholdContact[]>()
    for (const contact of contacts) map.set(contact.household_id, [...(map.get(contact.household_id) ?? []), contact])
    return map
  }, [contacts])

  const selected = households.find((household) => household.id === selectedId) ?? null
  const selectedLinks = selected ? linksByHousehold.get(selected.id) ?? [] : []
  const selectedContacts = selected ? contactsByHousehold.get(selected.id) ?? [] : []

  async function createHousehold() {
    if (profile?.role !== 'admin' || !newHouseholdName.trim() || saving) return
    setSaving(true)
    setMessage('')
    const { data, error } = await supabase.from('households').insert({ display_name: newHouseholdName.trim() }).select('id').single()
    if (error) setMessage(error.message)
    else {
      setNewHouseholdName('')
      setSelectedId(data.id)
      setMessage('Household created.')
      await loadData()
    }
    setSaving(false)
  }

  async function addChild() {
    if (!selected || profile?.role !== 'admin' || !childToAdd || saving) return
    const childId = Number(childToAdd)
    const alreadyLinked = links.some((link) => link.household_id === selected.id && link.child_id === childId && link.active)
    if (alreadyLinked) {
      setMessage('That child is already linked to this household.')
      return
    }
    const alreadyHasPrimary = links.some((link) => link.child_id === childId && link.active && link.is_primary)
    setSaving(true)
    setMessage('')
    const { error } = await supabase.from('household_children').insert({
      household_id: selected.id,
      child_id: childId,
      is_primary: !alreadyHasPrimary,
      active: true,
    })
    if (error) setMessage(error.message)
    else {
      setChildToAdd('')
      setMessage(alreadyHasPrimary ? 'Child linked as an additional household.' : 'Child linked and set as their primary household.')
      await loadData()
    }
    setSaving(false)
  }

  async function removeChild(link: HouseholdChild) {
    if (profile?.role !== 'admin' || saving) return
    const child = childById.get(link.child_id)
    if (!confirm(`Remove ${child ? fullName(child) : 'this child'} from this household? This does not delete the child profile.`)) return
    setSaving(true)
    const { error } = await supabase.from('household_children').delete().eq('household_id', link.household_id).eq('child_id', link.child_id)
    if (error) setMessage(error.message)
    else {
      setMessage('Household link removed.')
      await loadData()
    }
    setSaving(false)
  }

  function editContact(contact?: HouseholdContact) {
    if (!contact) {
      setContactForm(blankContact)
      return
    }
    setContactForm({
      id: contact.id,
      name: contact.name,
      relationship: contact.relationship ?? '',
      email: contact.email ?? '',
      phone: contact.phone ?? '',
      other_phone: contact.other_phone ?? '',
      address: contact.address ?? '',
      preferred_contact: contact.preferred_contact ?? '',
      is_primary: contact.is_primary,
    })
  }

  async function saveContact() {
    if (!selected || profile?.role !== 'admin' || !contactForm.name.trim() || saving) return
    setSaving(true)
    setMessage('')

    if (contactForm.is_primary) {
      const existingPrimary = selectedContacts.find((contact) => contact.is_primary && contact.id !== contactForm.id)
      if (existingPrimary) {
        const { error } = await supabase.from('household_contacts').update({ is_primary: false }).eq('id', existingPrimary.id)
        if (error) {
          setMessage(error.message)
          setSaving(false)
          return
        }
      }
    }

    const row = {
      household_id: selected.id,
      name: contactForm.name.trim(),
      relationship: contactForm.relationship.trim() || null,
      email: contactForm.email.trim() || null,
      phone: contactForm.phone.trim() || null,
      other_phone: contactForm.other_phone.trim() || null,
      address: contactForm.address.trim() || null,
      preferred_contact: contactForm.preferred_contact || null,
      is_primary: contactForm.is_primary,
      active: true,
    }

    const result = contactForm.id
      ? await supabase.from('household_contacts').update(row).eq('id', contactForm.id)
      : await supabase.from('household_contacts').insert(row)

    if (result.error) setMessage(result.error.message)
    else {
      setContactForm(blankContact)
      setMessage('Household contact saved.')
      await loadData()
    }
    setSaving(false)
  }

  async function deleteContact(contact: HouseholdContact) {
    if (profile?.role !== 'admin' || saving) return
    if (!confirm(`Remove ${contact.name} from this household's saved contacts?`)) return
    setSaving(true)
    const { error } = await supabase.from('household_contacts').delete().eq('id', contact.id)
    if (error) setMessage(error.message)
    else {
      setContactForm(blankContact)
      setMessage('Household contact removed.')
      await loadData()
    }
    setSaving(false)
  }

  if (loading && !session) return <main className="login-wrap"><div className="card login-card">Loading households…</div></main>
  if (!session) return <main className="login-wrap"><section className="card login-card"><h1>Households</h1><p className="subtle">Sign in through Juanita Hub to continue.</p></section></main>
  if (!profile?.active) return <main className="login-wrap"><section className="card login-card"><h1>Households</h1><div className="notice">Your staff account must be active.</div></section></main>

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Juanita Hub<small>Households</small></div>
        <div className="toolbar"><span>{profile.display_name} <span className="badge">{profile.role}</span></span></div>
      </header>

      <main className="main household-page">
        <section className="hero household-hero">
          <div><span className="household-eyebrow">People</span><h1>Households</h1><p className="subtle">Group siblings and shared family contacts without duplicating child profiles.</p></div>
          <div className="household-privacy-pill">🔒 Contact details are admin-only</div>
        </section>

        {message && <div className="notice">{message}</div>}

        {profile.role === 'admin' && (
          <section className="card household-create-bar">
            <label className="field"><span>New household name</span><input value={newHouseholdName} onChange={(event) => setNewHouseholdName(event.target.value)} placeholder="Example: Ahmed household" /></label>
            <button type="button" className="primary" onClick={() => void createHousehold()} disabled={saving || !newHouseholdName.trim()}>Create household</button>
          </section>
        )}

        <div className="household-layout">
          <section className="card household-list-panel">
            <div className="household-panel-heading"><div><small>Directory</small><h2>{households.length} households</h2></div></div>
            <div className="household-list">
              {households.map((household) => {
                const memberLinks = linksByHousehold.get(household.id) ?? []
                return (
                  <button type="button" key={household.id} className={`household-list-item ${selectedId === household.id ? 'active' : ''}`} onClick={() => { setSelectedId(household.id); setContactForm(blankContact) }}>
                    <span><strong>{household.display_name}</strong><small>{memberLinks.length} linked {memberLinks.length === 1 ? 'child' : 'children'}</small></span>
                    <span className={`household-status ${household.status}`}>{household.status}</span>
                  </button>
                )
              })}
              {households.length === 0 && <div className="household-empty">No households yet. Create one when you're ready to group siblings.</div>}
            </div>
          </section>

          <section className="card household-detail-panel">
            {!selected ? (
              <div className="household-empty large"><strong>Select a household</strong><span>Linked children and shared contacts will appear here.</span></div>
            ) : (
              <>
                <div className="household-detail-heading"><div><span className="household-eyebrow">Household profile</span><h2>{selected.display_name}</h2></div><span className={`household-status ${selected.status}`}>{selected.status}</span></div>

                <section className="household-section">
                  <div className="household-section-title"><div><small>Family members</small><h3>Linked children</h3></div></div>
                  <div className="household-members">
                    {selectedLinks.map((link) => {
                      const child = childById.get(link.child_id)
                      if (!child) return null
                      return <div className="household-member" key={`${link.household_id}-${link.child_id}`}><span><strong>{fullName(child)}</strong><small>{link.is_primary ? 'Primary household' : 'Additional household'}</small></span>{profile.role === 'admin' && <button type="button" className="ghost danger-button" onClick={() => void removeChild(link)}>Remove</button>}</div>
                    })}
                    {selectedLinks.length === 0 && <div className="household-empty">No children linked yet.</div>}
                  </div>
                  {profile.role === 'admin' && (
                    <div className="household-add-child"><select value={childToAdd} onChange={(event) => setChildToAdd(event.target.value)}><option value="">Choose a child…</option>{children.filter((child) => !selectedLinks.some((link) => link.child_id === child.id)).map((child) => <option key={child.id} value={child.id}>{fullName(child)}</option>)}</select><button type="button" className="primary" onClick={() => void addChild()} disabled={!childToAdd || saving}>Link child</button></div>
                  )}
                </section>

                {profile.role === 'admin' ? (
                  <section className="household-section sensitive">
                    <div className="household-section-title"><div><small>Restricted</small><h3>Shared family contacts</h3></div><button type="button" className="ghost" onClick={() => editContact()}>Add contact</button></div>
                    <div className="household-contacts">
                      {selectedContacts.map((contact) => <article className="household-contact" key={contact.id}><div><small>{contact.is_primary ? 'Primary contact' : contact.relationship || 'Contact'}</small><strong>{contact.name}</strong>{contact.phone && <a href={`tel:${contact.phone}`}>{contact.phone}</a>}{contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}</div><div className="household-contact-actions"><button type="button" className="ghost" onClick={() => editContact(contact)}>Edit</button><button type="button" className="ghost danger-button" onClick={() => void deleteContact(contact)}>Remove</button></div></article>)}
                      {selectedContacts.length === 0 && <div className="household-empty">No shared household contacts saved yet.</div>}
                    </div>

                    <div className="household-contact-editor">
                      <h4>{contactForm.id ? 'Edit contact' : 'Add a household contact'}</h4>
                      <div className="household-form-grid">
                        <label className="field"><span>Name</span><input value={contactForm.name} onChange={(event) => setContactForm((current) => ({ ...current, name: event.target.value }))} /></label>
                        <label className="field"><span>Relationship</span><input value={contactForm.relationship} onChange={(event) => setContactForm((current) => ({ ...current, relationship: event.target.value }))} /></label>
                        <label className="field"><span>Phone</span><input type="tel" value={contactForm.phone} onChange={(event) => setContactForm((current) => ({ ...current, phone: event.target.value }))} /></label>
                        <label className="field"><span>Other phone</span><input type="tel" value={contactForm.other_phone} onChange={(event) => setContactForm((current) => ({ ...current, other_phone: event.target.value }))} /></label>
                        <label className="field"><span>Email</span><input type="email" value={contactForm.email} onChange={(event) => setContactForm((current) => ({ ...current, email: event.target.value }))} /></label>
                        <label className="field"><span>Preferred contact</span><select value={contactForm.preferred_contact} onChange={(event) => setContactForm((current) => ({ ...current, preferred_contact: event.target.value as ContactForm['preferred_contact'] }))}><option value="">Not set</option><option value="phone">Phone</option><option value="text">Text</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="other">Other</option></select></label>
                        <label className="field full"><span>Address</span><input value={contactForm.address} onChange={(event) => setContactForm((current) => ({ ...current, address: event.target.value }))} /></label>
                        <label className="household-primary-check"><input type="checkbox" checked={contactForm.is_primary} onChange={(event) => setContactForm((current) => ({ ...current, is_primary: event.target.checked }))} /><span>Primary household contact</span></label>
                      </div>
                      <div className="household-contact-editor-actions"><button type="button" className="ghost" onClick={() => setContactForm(blankContact)} disabled={saving}>Clear</button><button type="button" className="primary" onClick={() => void saveContact()} disabled={saving || !contactForm.name.trim()}>{saving ? 'Saving…' : 'Save contact'}</button></div>
                    </div>
                  </section>
                ) : (
                  <section className="household-section locked"><strong>Shared contact information is restricted.</strong><p>Admins can review and update household phone, email, and address information.</p></section>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
