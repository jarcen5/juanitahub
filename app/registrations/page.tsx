'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import SafeRichText from '@/components/SafeRichText'

type RegistrationMode = 'full' | 'renewal' | 'summer_short' | 'permission_only' | 'short_youth' | 'adult_short'
type Program = {
  id: number
  name: string
  season_label: string | null
  status: 'draft' | 'open' | 'closed' | 'completed' | 'archived'
  public_registration_id: string
  registration_public: boolean
  registration_intro: string | null
  registration_opens_at: string | null
  registration_closes_at: string | null
}
type Option = { program_id: number; registration_mode: RegistrationMode; display_order: number }
type Household = { id: number; display_name: string; status: string }
type Consent = { id: number; program_id: number; title: string; body: string; required: boolean; applies_to_modes: RegistrationMode[]; active: boolean; display_order: number }
type Submission = {
  id: string
  submission_code: string
  program_id: number
  registration_mode: RegistrationMode
  status: 'submitted' | 'needs_review' | 'approved' | 'declined'
  submitter_name: string | null
  submitter_email: string | null
  submitter_phone: string | null
  payload: any
  review_notes: string | null
  created_at: string
}

type Profile = { display_name: string; role: 'staff' | 'admin'; active: boolean }

const modeLabels: Record<RegistrationMode, string> = {
  full: 'Full registration', renewal: 'Returning family renewal', summer_short: 'Summer short registration',
  permission_only: 'Permission only', short_youth: 'Short youth registration', adult_short: 'Adult registration',
}

const submissionStatusLabels: Record<Submission['status'], string> = {
  submitted: 'Submitted',
  needs_review: 'Needs family follow-up',
  approved: 'Approved',
  declined: 'Declined',
}

function localInput(value: string | null) {
  if (!value) return ''
  const d = new Date(value)
  const offset = d.getTimezoneOffset()
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 16)
}

export default function RegistrationsPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [programs, setPrograms] = useState<Program[]>([])
  const [options, setOptions] = useState<Option[]>([])
  const [households, setHouseholds] = useState<Household[]>([])
  const [consents, setConsents] = useState<Consent[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null)
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null)
  const [tab, setTab] = useState<'setup' | 'review'>('setup')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [intro, setIntro] = useState('')
  const [opensAt, setOpensAt] = useState('')
  const [closesAt, setClosesAt] = useState('')
  const [renewalHouseholdId, setRenewalHouseholdId] = useState('')
  const [generatedLink, setGeneratedLink] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')
  const [deleteSubmissionConfirm, setDeleteSubmissionConfirm] = useState(false)
  const [consentTitle, setConsentTitle] = useState('')
  const [consentBody, setConsentBody] = useState('')
  const [consentRequired, setConsentRequired] = useState(true)
  const [consentModes, setConsentModes] = useState<RegistrationMode[]>([])
  const introRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    let mounted = true
    void supabase.auth.getSession().then(({ data }) => { if (mounted) setSession(data.session) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { if (mounted) setSession(next) })
    return () => { mounted = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => { if (session) void loadData(); else setLoading(false) }, [session])

  async function loadData() {
    if (!session) return
    setLoading(true)
    const [profileResult, programsResult, optionsResult, householdsResult, consentResult, submissionResult] = await Promise.all([
      supabase.from('staff_profiles').select('display_name,role,active').eq('user_id', session.user.id).maybeSingle(),
      supabase.from('programs').select('id,name,season_label,status,public_registration_id,registration_public,registration_intro,registration_opens_at,registration_closes_at').order('created_at', { ascending: false }),
      supabase.from('program_registration_options').select('program_id,registration_mode,display_order').order('display_order'),
      supabase.from('households').select('id,display_name,status').eq('status','active').order('display_name'),
      supabase.from('program_registration_consents').select('id,program_id,title,body,required,applies_to_modes,active,display_order').order('display_order').order('id'),
      supabase.from('registration_submissions').select('id,submission_code,program_id,registration_mode,status,submitter_name,submitter_email,submitter_phone,payload,review_notes,created_at').order('created_at', { ascending: false }),
    ])
    setProfile(profileResult.data as Profile | null)
    setPrograms((programsResult.data ?? []) as Program[])
    setOptions((optionsResult.data ?? []) as Option[])
    setHouseholds((householdsResult.data ?? []) as Household[])
    setConsents((consentResult.data ?? []) as Consent[])
    setSubmissions((submissionResult.data ?? []) as Submission[])
    const error = profileResult.error || programsResult.error || optionsResult.error || householdsResult.error || consentResult.error || submissionResult.error
    if (error) setMessage(error.message)
    setLoading(false)
  }

  const selectedProgram = programs.find((p) => p.id === selectedProgramId) ?? null
  const selectedSubmission = submissions.find((s) => s.id === selectedSubmissionId) ?? null
  const programModes = useMemo(() => options.filter((o) => o.program_id === selectedProgramId).map((o) => o.registration_mode), [options, selectedProgramId])
  const programConsents = useMemo(() => consents.filter((c) => c.program_id === selectedProgramId && c.active), [consents, selectedProgramId])
  const programById = useMemo(() => new Map(programs.map((p) => [p.id, p])), [programs])

  useEffect(() => {
    if (!selectedProgram) return
    setIntro(selectedProgram.registration_intro ?? '')
    setOpensAt(localInput(selectedProgram.registration_opens_at))
    setClosesAt(localInput(selectedProgram.registration_closes_at))
    setConsentModes(programModes)
    setGeneratedLink('')
  }, [selectedProgramId, selectedProgram, programModes.join('|')])

  useEffect(() => {
    setReviewNotes(selectedSubmission?.review_notes ?? '')
    setDeleteSubmissionConfirm(false)
  }, [selectedSubmissionId, selectedSubmission])

  function restoreIntroSelection(start: number, end: number) {
    requestAnimationFrame(() => {
      const textarea = introRef.current
      if (!textarea) return
      textarea.focus()
      textarea.setSelectionRange(start, end)
    })
  }

  function replaceIntroRange(start: number, end: number, replacement: string, selectionStart = start, selectionEnd = start + replacement.length) {
    setIntro(intro.slice(0, start) + replacement + intro.slice(end))
    restoreIntroSelection(selectionStart, selectionEnd)
  }

  function formatIntroBold() {
    const textarea = introRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = intro.slice(start, end) || 'bold text'
    const replacement = `**${selected}**`
    replaceIntroRange(start, end, replacement, start + 2, start + 2 + selected.length)
  }

  function formatIntroLines(kind: 'heading' | 'bullets' | 'numbers') {
    const textarea = introRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const lineStart = intro.lastIndexOf('\n', Math.max(0, start - 1)) + 1
    const nextBreak = intro.indexOf('\n', end)
    const lineEnd = nextBreak === -1 ? intro.length : nextBreak
    const block = intro.slice(lineStart, lineEnd)
    let number = 0
    const replacement = block.split('\n').map((line) => {
      if (!line.trim()) return line
      const clean = line.replace(/^(?:#{1,3}\s+|[-*]\s+|\d+\.\s+)/, '')
      if (kind === 'heading') return `## ${clean}`
      if (kind === 'bullets') return `- ${clean}`
      number += 1
      return `${number}. ${clean}`
    }).join('\n')
    replaceIntroRange(lineStart, lineEnd, replacement, lineStart, lineStart + replacement.length)
  }

  function formatIntroLink() {
    const textarea = introRef.current
    if (!textarea || typeof window === 'undefined') return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = intro.slice(start, end)
    const label = selected || window.prompt('What text should be clickable?', 'Learn more')
    if (!label) return
    let href = window.prompt('Enter the web address or email address for this link:', '')
    if (!href) return
    href = href.trim()
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(href)) href = `mailto:${href}`
    else if (!/^(https?:\/\/|mailto:|tel:)/i.test(href)) href = `https://${href}`
    const replacement = `[${label}](${href})`
    replaceIntroRange(start, end, replacement, start, start + replacement.length)
  }

  async function savePortalSettings() {
    if (!selectedProgram || profile?.role !== 'admin' || saving) return
    setSaving(true); setMessage('')
    const { error } = await supabase.from('programs').update({
      registration_intro: intro.trim() || null,
      registration_opens_at: opensAt ? new Date(opensAt).toISOString() : null,
      registration_closes_at: closesAt ? new Date(closesAt).toISOString() : null,
    }).eq('id', selectedProgram.id)
    if (error) setMessage(error.message)
    else { setMessage('Registration portal settings saved.'); await loadData() }
    setSaving(false)
  }

  async function togglePublic() {
    if (!selectedProgram || profile?.role !== 'admin' || saving) return
    if (!selectedProgram.registration_public && selectedProgram.status !== 'open') {
      setMessage('Set the program status to Open on Programs & Enrollments before publishing its registration link.')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('programs').update({ registration_public: !selectedProgram.registration_public }).eq('id', selectedProgram.id)
    if (error) setMessage(error.message)
    else { setMessage(selectedProgram.registration_public ? 'Public registration unpublished.' : 'Public registration published.'); await loadData() }
    setSaving(false)
  }

  function publicLink(program = selectedProgram) {
    if (!program || typeof window === 'undefined') return ''
    return `${window.location.origin}/register/${program.public_registration_id}`
  }

  async function copyText(value: string) {
    try { await navigator.clipboard.writeText(value); setMessage('Link copied to clipboard.') }
    catch { setMessage('Copy was blocked by the browser. You can select and copy the link manually.') }
  }

  async function generateRenewalLink() {
    if (!selectedProgram || !renewalHouseholdId || profile?.role !== 'admin' || saving) return
    setSaving(true); setMessage('')
    const { data, error } = await supabase.rpc('create_registration_access_token', {
      p_program_id: selectedProgram.id, p_household_id: Number(renewalHouseholdId), p_expires_days: 14,
    })
    if (error || !data) setMessage(error?.message ?? 'Could not create the renewal link.')
    else {
      const link = `${publicLink(selectedProgram)}?token=${encodeURIComponent(data as string)}`
      setGeneratedLink(link)
      setMessage('Secure renewal link created. It expires in 14 days and is used once a registration is submitted.')
    }
    setSaving(false)
  }

  function toggleConsentMode(mode: RegistrationMode) {
    setConsentModes((current) => current.includes(mode) ? current.filter((m) => m !== mode) : [...current, mode])
  }

  async function addConsent() {
    if (!selectedProgram || !consentTitle.trim() || !consentBody.trim() || !consentModes.length || profile?.role !== 'admin' || saving) return
    setSaving(true)
    const { error } = await supabase.from('program_registration_consents').insert({
      program_id: selectedProgram.id, title: consentTitle.trim(), body: consentBody.trim(), required: consentRequired,
      applies_to_modes: consentModes, display_order: programConsents.length,
    })
    if (error) setMessage(error.message)
    else { setConsentTitle(''); setConsentBody(''); setConsentRequired(true); setMessage('Permission statement added.'); await loadData() }
    setSaving(false)
  }

  async function removeConsent(id: number) {
    if (profile?.role !== 'admin' || saving || !confirm('Remove this permission statement from future registrations? Existing submitted snapshots will not be changed.')) return
    setSaving(true)
    const { error } = await supabase.from('program_registration_consents').delete().eq('id', id)
    if (error) setMessage(error.message); else { setMessage('Permission statement removed.'); await loadData() }
    setSaving(false)
  }

  async function updateSubmissionStatus(status: Submission['status']) {
    if (!selectedSubmission || !session || profile?.role !== 'admin' || saving) return
    setSaving(true)
    if (status === 'approved') {
      const { error } = await supabase.rpc('approve_registration_submission', { p_submission_id: selectedSubmission.id })
      if (error) setMessage(error.message)
      else { setMessage('Registration approved and added to Juanita Hub.'); await loadData() }
    } else {
      const { error } = await supabase.from('registration_submissions').update({
        status, review_notes: reviewNotes.trim() || null, reviewed_by: session.user.id, reviewed_at: new Date().toISOString(),
      }).eq('id', selectedSubmission.id)
      if (error) setMessage(error.message)
      else { setMessage(status === 'declined' ? 'Registration declined.' : 'Registration marked as needing family follow-up.'); await loadData() }
    }
    setSaving(false)
  }

  async function deleteSubmission() {
    if (!selectedSubmission || profile?.role !== 'admin' || saving || selectedSubmission.status === 'approved') return

    setSaving(true)
    setMessage('')

    const { data, error } = await supabase
      .from('registration_submissions')
      .delete()
      .eq('id', selectedSubmission.id)
      .neq('status', 'approved')
      .select('id')
      .maybeSingle()

    if (error) {
      setMessage(error.message)
    } else if (!data) {
      setMessage('This submission could not be deleted. Approved submissions are kept as registration history.')
    } else {
      setSubmissions((current) => current.filter((submission) => submission.id !== selectedSubmission.id))
      setSelectedSubmissionId(null)
      setDeleteSubmissionConfirm(false)
      setReviewNotes('')
      setMessage('Submission permanently deleted.')
    }

    setSaving(false)
  }

  if (loading) return <main className="login-wrap"><div className="card login-card">Loading registration portal…</div></main>
  if (!session) return <main className="login-wrap"><div className="card login-card"><h1>Registration Portal</h1><p className="subtle">Sign in to Juanita Hub to continue.</p></div></main>
  if (!profile?.active || profile.role !== 'admin') return <main className="login-wrap"><div className="card login-card"><h1>Registration Portal</h1><p className="subtle">Admin access is required.</p></div></main>

  const payload = selectedSubmission?.payload ?? {}
  const selectedChildren = Array.isArray(payload.children) ? payload.children.filter((c: any) => c.selected !== false) : []

  return <div className="shell"><header className="topbar"><div className="brand">Juanita Hub<small>Registration Portal</small></div><div className="toolbar"><span>{profile.display_name} <span className="badge">admin</span></span></div></header>
    <main className="main registration-admin-page">
      <section className="hero registration-admin-hero"><div><span className="registration-kicker">Family intake</span><h1>Registration Portal</h1><p className="subtle">Publish registration links, create secure renewals, configure permissions, and review family submissions.</p></div></section>
      {message && <div className="notice">{message}</div>}
      <div className="registration-tabs"><button className={tab==='setup'?'active':''} onClick={()=>setTab('setup')}>Portal Setup</button><button className={tab==='review'?'active':''} onClick={()=>setTab('review')}>Review Submissions <span>{submissions.filter(s=>s.status==='submitted'||s.status==='needs_review').length}</span></button></div>

      {tab === 'setup' ? <div className="registration-admin-grid">
        <section className="card registration-program-list"><h2>Programs</h2>{programs.map((program)=><button key={program.id} className={selectedProgramId===program.id?'active':''} onClick={()=>setSelectedProgramId(program.id)}><span><strong>{program.name}</strong><small>{program.season_label || 'No season'} • {program.status}</small></span><em>{program.registration_public?'Published':'Private'}</em></button>)}{!programs.length&&<p className="subtle">Create a program first.</p>}</section>
        <section className="card registration-setup-panel">{!selectedProgram?<div className="registration-empty"><strong>Select a program</strong><span>Its public registration settings will appear here.</span></div>:<>
          <div className="registration-setup-heading"><div><small>Selected program</small><h2>{selectedProgram.name}</h2><div className="registration-mode-chips">{programModes.map(m=><span key={m}>{modeLabels[m]}</span>)}</div></div><button className={selectedProgram.registration_public?'ghost':'primary'} onClick={()=>void togglePublic()} disabled={saving}>{selectedProgram.registration_public?'Unpublish':'Publish registration'}</button></div>
          <div className="registration-settings-grid"><div className="field full registration-rich-editor"><label htmlFor="registration-intro">Welcome / instructions</label><div className="registration-format-toolbar" role="toolbar" aria-label="Description formatting"><button type="button" className="ghost" onClick={()=>formatIntroLines('heading')}>Heading</button><button type="button" className="ghost" onClick={formatIntroBold}><strong>B</strong> Bold</button><button type="button" className="ghost" onClick={()=>formatIntroLines('bullets')}>• Bullets</button><button type="button" className="ghost" onClick={()=>formatIntroLines('numbers')}>1. Numbered</button><button type="button" className="ghost" onClick={formatIntroLink}>🔗 Link</button></div><textarea id="registration-intro" ref={introRef} rows={10} value={intro} onChange={e=>setIntro(e.target.value)} placeholder="Tell families what to know before they begin…" /><small className="subtle">Select text, then use the toolbar. Paragraph breaks and line breaks are preserved.</small><div className="registration-rich-preview"><div className="registration-preview-label">Live preview</div><SafeRichText className="registration-rich-preview-content" text={intro || 'Your formatted registration description will appear here.'} /></div></div><label className="field"><span>Registration opens</span><input type="datetime-local" value={opensAt} onChange={e=>setOpensAt(e.target.value)} /></label><label className="field"><span>Registration closes</span><input type="datetime-local" value={closesAt} onChange={e=>setClosesAt(e.target.value)} /></label></div><div className="registration-actions"><button className="primary" onClick={()=>void savePortalSettings()} disabled={saving}>Save portal settings</button></div>
          <div className="registration-link-box"><small>Public registration link</small><div><input readOnly value={publicLink()} /><button className="ghost" onClick={()=>void copyText(publicLink())}>Copy</button></div><p>{selectedProgram.registration_public?'This link is available while the program is Open and within the registration dates above.':'The link stays inaccessible to families until you publish registration.'}</p></div>

          {programModes.some(m=>['renewal','summer_short','permission_only'].includes(m)) && <div className="registration-renewal-box"><div><small>Returning households</small><h3>Create a secure renewal link</h3><p className="subtle">Choose one household. The link exposes only that household’s registration information and expires after 14 days.</p></div><div className="registration-renewal-controls"><select value={renewalHouseholdId} onChange={e=>setRenewalHouseholdId(e.target.value)}><option value="">Choose a household…</option>{households.map(h=><option key={h.id} value={h.id}>{h.display_name}</option>)}</select><button className="primary" disabled={!renewalHouseholdId||saving} onClick={()=>void generateRenewalLink()}>Create renewal link</button></div>{generatedLink&&<div className="registration-generated-link"><input readOnly value={generatedLink}/><button className="ghost" onClick={()=>void copyText(generatedLink)}>Copy secure link</button></div>}</div>}

          <div className="registration-consent-builder"><div><small>Program permissions</small><h3>Permission & consent statements</h3><p className="subtle">Use your center’s exact wording. Required acknowledgments must be accepted for enrollment; optional permissions ask families to choose Yes or No.</p></div>{programConsents.map(c=><article key={c.id}><div><strong>{c.title}</strong><p>{c.body}</p><small>{c.required?'Agreement required':'Parent may accept or decline'} • {c.applies_to_modes.map(m=>modeLabels[m]).join(', ')}</small></div><button className="ghost danger-button" onClick={()=>void removeConsent(c.id)}>Remove</button></article>)}
            <div className="registration-consent-form"><label className="field"><span>Short title</span><input value={consentTitle} onChange={e=>setConsentTitle(e.target.value)} placeholder="Media permission" /></label><label className="field full"><span>Exact permission wording</span><textarea rows={4} value={consentBody} onChange={e=>setConsentBody(e.target.value)} /></label><div className="registration-consent-modes"><span>Show for</span>{programModes.map(m=><label key={m}><input type="checkbox" checked={consentModes.includes(m)} onChange={()=>toggleConsentMode(m)} /> {modeLabels[m]}</label>)}</div><label className="registration-required-check"><input type="checkbox" checked={consentRequired} onChange={e=>setConsentRequired(e.target.checked)} /><span><strong>Agreement required for enrollment</strong><small>Turn this off for permissions such as media where families may choose Yes or No.</small></span></label><button className="primary" disabled={!consentTitle.trim()||!consentBody.trim()||!consentModes.length||saving} onClick={()=>void addConsent()}>Add permission statement</button></div>
          </div>
        </>}</section>
      </div> : <div className="registration-admin-grid review-grid">
        <section className="card registration-submission-list"><div className="registration-list-heading"><h2>Submissions</h2><span>{submissions.length}</span></div>{submissions.map(s=><button key={s.id} className={selectedSubmissionId===s.id?'active':''} onClick={()=>setSelectedSubmissionId(s.id)}><span><strong>{s.submitter_name || 'Unnamed submission'}</strong><small>{programById.get(s.program_id)?.name || 'Program'} • {modeLabels[s.registration_mode]}</small><small>{new Date(s.created_at).toLocaleString()}</small></span><em className={`registration-status ${s.status}`}>{submissionStatusLabels[s.status]}</em></button>)}{!submissions.length&&<p className="subtle">No submissions yet.</p>}</section>
        <section className="card registration-review-panel">{!selectedSubmission?<div className="registration-empty"><strong>Select a submission</strong><span>Review its information before approving it.</span></div>:<><div className="registration-review-heading"><div><small>Submission {selectedSubmission.submission_code}</small><h2>{selectedSubmission.submitter_name || 'Registration submission'}</h2><p>{programById.get(selectedSubmission.program_id)?.name} • {modeLabels[selectedSubmission.registration_mode]}</p></div><span className={`registration-status ${selectedSubmission.status}`}>{submissionStatusLabels[selectedSubmission.status]}</span></div>
          <div className="registration-review-contact"><div><small>Email</small><strong>{selectedSubmission.submitter_email || 'Not provided'}</strong></div><div><small>Phone</small><strong>{selectedSubmission.submitter_phone || 'Not provided'}</strong></div></div>
          {payload.guardian&&<section className="registration-review-section"><h3>Parent / Guardian</h3><p><strong>{payload.guardian.name}</strong>{payload.guardian.relationship?` • ${payload.guardian.relationship}`:''}</p><p>{payload.guardian.address || ''}</p></section>}
          {payload.adult&&<section className="registration-review-section"><h3>Adult participant</h3><p><strong>{payload.adult.first_name} {payload.adult.last_name}</strong></p><p>{payload.adult.address || ''}</p></section>}
          {!!selectedChildren.length&&<section className="registration-review-section"><h3>Children ({selectedChildren.length})</h3>{selectedChildren.map((child:any,index:number)=><article className="registration-review-child" key={`${child.existing_child_id||child.first_name}-${index}`}><strong>{child.first_name} {child.last_name}</strong><div><span>{child.birth_date?`DOB ${child.birth_date}`:'DOB not provided'}</span><span>{child.school||'School not provided'}{child.grade?` • ${child.grade}`:''}</span></div>{(child.allergies||child.medical_conditions||child.learning_support||child.behavioral_support)&&<p><b>Safety/support:</b> {[child.allergies,child.medical_conditions,child.learning_support,child.behavioral_support].filter(Boolean).join(' • ')}</p>}</article>)}</section>}
          {Array.isArray(payload.consents)&&payload.consents.length>0&&<section className="registration-review-section"><h3>Permissions</h3>{payload.consents.map((c:any)=><p key={c.id}><strong>{c.agreed?'✓ Agreed':'✕ Did not agree'} — {c.title}</strong> {c.required?'(agreement required)':''}</p>)}</section>}
          <section className="registration-review-section"><h3>Signature</h3><p>{payload.signature_name || 'Not recorded'} • {payload.signature_date || ''}</p></section>
          <label className="field registration-review-notes"><span>Internal review notes</span><textarea rows={3} value={reviewNotes} onChange={e=>setReviewNotes(e.target.value)} /></label>
          <div className="registration-review-action-guide">
            <div><strong>Needs family follow-up</strong><span>Hold this submission while you contact the family. No child, household, health, or roster records are changed.</span></div>
            <div><strong>Decline</strong><span>Close the submission without adding it to Juanita Hub. You can reopen it for follow-up later.</span></div>
            <div><strong>Approve & add</strong><span>Apply the submitted information to the real Juanita Hub records and enroll the participant.</span></div>
          </div>
          <div className="registration-review-actions"><button className="ghost" disabled={saving||selectedSubmission.status==='approved'} onClick={()=>void updateSubmissionStatus('needs_review')}>Needs family follow-up</button><button className="ghost danger-button" disabled={saving||selectedSubmission.status==='approved'} onClick={()=>void updateSubmissionStatus('declined')}>Decline</button><button className="primary" disabled={saving||selectedSubmission.status==='approved'||selectedSubmission.status==='declined'} onClick={()=>void updateSubmissionStatus('approved')}>{saving?'Working…':'Approve & add to Juanita Hub'}</button></div>
          {selectedSubmission.status !== 'approved' && <div className="registration-delete-submission">
            {!deleteSubmissionConfirm ? <button className="ghost danger-button" disabled={saving} onClick={()=>setDeleteSubmissionConfirm(true)}>Delete submission</button> : <div className="registration-delete-confirm"><span><strong>Permanently delete this submission?</strong><small>Use this for tests, duplicates, spam, or submissions you do not need to retain. This cannot be undone.</small></span><div><button className="ghost" disabled={saving} onClick={()=>setDeleteSubmissionConfirm(false)}>Keep submission</button><button className="ghost danger-button" disabled={saving} onClick={()=>void deleteSubmission()}>{saving?'Deleting…':'Yes, delete permanently'}</button></div></div>}
          </div>}
          {selectedSubmission.status === 'approved' && <div className="registration-approved-history-note"><strong>Approved submission retained</strong><span>Approved submissions cannot be deleted because they are part of the participant’s registration and consent history.</span></div>}
        </>}</section>
      </div>}
    </main></div>
}
