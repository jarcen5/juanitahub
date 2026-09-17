'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type RegistrationMode = 'full' | 'renewal' | 'summer_short' | 'permission_only' | 'short_youth' | 'adult_short'
type Program = {
  public_id: string
  name: string
  program_type: string
  audience: string
  season_label: string | null
  description: string | null
  introduction: string | null
  location: string | null
  starts_on: string | null
  ends_on: string | null
  meeting_days: string[]
  capacity: number | null
  registration_modes: RegistrationMode[]
  consents: Consent[]
}
type Consent = { id: number; title: string; body: string; required: boolean; applies_to_modes: RegistrationMode[]; display_order: number }
type Guardian = { name: string; relationship: string; email: string; phone: string; other_phone: string; address: string; preferred_contact: string }
type Emergency = { name: string; relationship: string; phone: string }
type ChildForm = {
  existing_child_id?: number
  first_name: string
  last_name: string
  birth_date: string
  school: string
  grade: string
  attendance_days: string[]
  attends_other_program: boolean
  other_program_arrival_notes: string
  dismissal_plan: string
  dismissal_notes: string
  allergies: string
  medical_conditions: string
  learning_support: string
  behavioral_support: string
  actions_to_take: string
  important_care_notes: string
  shirt_size: string
  dietary_restrictions: string
  selected: boolean
}
type AdultForm = { first_name: string; last_name: string; email: string; phone: string; other_phone: string; address: string; preferred_contact: string; emergency_contact_name: string; emergency_contact_relationship: string; emergency_contact_phone: string }

const modeLabels: Record<RegistrationMode, string> = {
  full: 'New family registration', renewal: 'Returning family renewal', summer_short: 'Returning family — summer',
  permission_only: 'Existing family permission form', short_youth: 'Short youth registration', adult_short: 'Adult registration',
}
const modeDescriptions: Record<RegistrationMode, string> = {
  full: 'Complete the full family and child registration.',
  renewal: 'Review what we already have, update anything that changed, and choose which children are returning.',
  summer_short: 'Review your family information and answer only the summer-specific questions for participating children.',
  permission_only: 'Choose the child or children you give permission to participate.',
  short_youth: 'A shorter registration for youth joining this activity who are not already enrolled with the center.',
  adult_short: 'A simple registration for adult classes and workshops.',
}
const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

function blankChild(): ChildForm {
  return { first_name:'',last_name:'',birth_date:'',school:'',grade:'',attendance_days:[],attends_other_program:false,other_program_arrival_notes:'',dismissal_plan:'',dismissal_notes:'',allergies:'',medical_conditions:'',learning_support:'',behavioral_support:'',actions_to_take:'',important_care_notes:'',shirt_size:'',dietary_restrictions:'',selected:true }
}
const blankGuardian: Guardian = { name:'',relationship:'Parent/Guardian',email:'',phone:'',other_phone:'',address:'',preferred_contact:'Text' }
const blankEmergency: Emergency = { name:'',relationship:'',phone:'' }
const blankAdult: AdultForm = { first_name:'',last_name:'',email:'',phone:'',other_phone:'',address:'',preferred_contact:'Text',emergency_contact_name:'',emergency_contact_relationship:'',emergency_contact_phone:'' }

function dateLabel(value: string | null) {
  if (!value) return ''
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})
}

export default function PublicRegistrationPage() {
  const params = useParams<{ publicId: string }>()
  const search = useSearchParams()
  const publicId = params.publicId
  const token = search.get('token') ?? ''
  const [program, setProgram] = useState<Program | null>(null)
  const [mode, setMode] = useState<RegistrationMode | null>(null)
  const [guardian, setGuardian] = useState<Guardian>(blankGuardian)
  const [emergency, setEmergency] = useState<Emergency>(blankEmergency)
  const [children, setChildren] = useState<ChildForm[]>([blankChild()])
  const [adult, setAdult] = useState<AdultForm>(blankAdult)
  const [householdName, setHouseholdName] = useState('')
  const [signatureName, setSignatureName] = useState('')
  const [signatureDate, setSignatureDate] = useState(new Date().toISOString().slice(0,10))
  const [accuracy, setAccuracy] = useState(false)
  const [consentAnswers, setConsentAnswers] = useState<Record<string, boolean>>({})
  const [website, setWebsite] = useState('')
  const [renewalLoaded, setRenewalLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState('')

  useEffect(() => { void loadProgram() }, [publicId])

  async function invoke(body: any) {
    const { data, error } = await supabase.functions.invoke('registration-portal', { body })
    if (error) throw new Error(error.message)
    if (data?.error) throw new Error(data.error)
    return data
  }

  async function loadProgram() {
    setLoading(true); setError('')
    try {
      const data = await invoke({ action:'get_program', public_id: publicId })
      const next = data.program as Program
      setProgram(next)
      const tokenModes = next.registration_modes.filter((m)=>['renewal','summer_short','permission_only'].includes(m))
      if (token && tokenModes.length) {
        setMode(tokenModes[0])
        await loadRenewal(next, tokenModes[0])
      } else if (next.registration_modes.length === 1) setMode(next.registration_modes[0])
    } catch (e:any) { setError(e.message || 'Registration could not be loaded.') }
    setLoading(false)
  }

  async function loadRenewal(currentProgram = program, preferredMode = mode) {
    if (!currentProgram || !token) return
    setError('')
    try {
      const data = await invoke({ action:'renewal_preview', public_id: publicId, token })
      const renewal = data.renewal
      setHouseholdName(renewal.household?.display_name ?? '')
      if (renewal.guardian) setGuardian({
        name: renewal.guardian.name ?? '', relationship: renewal.guardian.relationship ?? 'Parent/Guardian', email: renewal.guardian.email ?? '',
        phone: renewal.guardian.phone ?? '', other_phone: renewal.guardian.other_phone ?? '', address: renewal.guardian.address ?? '', preferred_contact: renewal.guardian.preferred_contact ?? 'Text',
      })
      setChildren((renewal.children ?? []).map((child:any)=>({ ...blankChild(), ...child, selected:true })))
      setRenewalLoaded(true)
      if (preferredMode) setMode(preferredMode)
    } catch (e:any) { setError(e.message || 'The renewal link could not be opened.'); setRenewalLoaded(false) }
  }

  function selectMode(next: RegistrationMode) {
    setMode(next); setError(''); setConfirmation('')
    if (['renewal','summer_short','permission_only'].includes(next) && token && !renewalLoaded) void loadRenewal(program,next)
  }

  const applicableConsents = useMemo(() => (program?.consents ?? []).filter(c => mode && c.applies_to_modes.includes(mode)), [program,mode])
  const tokenMode = !!mode && ['renewal','summer_short','permission_only'].includes(mode)
  const newYouthMode = mode === 'full' || mode === 'short_youth'
  const fullDetails = mode === 'full' || mode === 'renewal'
  const summerMode = mode === 'summer_short'
  const permissionMode = mode === 'permission_only'

  function updateChild(index: number, patch: Partial<ChildForm>) {
    setChildren(current => current.map((child,i)=>i===index?{...child,...patch}:child))
  }
  function toggleDay(index:number, day:string) {
    const current=children[index].attendance_days
    updateChild(index,{attendance_days:current.includes(day)?current.filter(d=>d!==day):[...current,day]})
  }

  async function submit() {
    if (!program || !mode || submitting) return
    setSubmitting(true); setError('')
    try {
      const payload:any = {
        household_display_name: householdName,
        guardian,
        emergency,
        children,
        adult,
        signature_name: signatureName,
        signature_date: signatureDate,
        info_accuracy_confirmed: accuracy,
        consent_answers: consentAnswers,
      }
      const data = await invoke({ action:'submit', public_id:publicId, token: token || undefined, registration_mode:mode, payload, website })
      setConfirmation(data.submission_code)
      window.scrollTo({top:0,behavior:'smooth'})
    } catch (e:any) { setError(e.message || 'Registration could not be submitted.') }
    setSubmitting(false)
  }

  if (loading) return <main className="public-registration-shell"><section className="public-registration-card loading">Loading registration…</section></main>
  if (!program) return <main className="public-registration-shell"><section className="public-registration-card error"><h1>Registration unavailable</h1><p>{error || 'This registration link is not available.'}</p></section></main>
  if (confirmation) return <main className="public-registration-shell"><section className="public-registration-card confirmation"><div className="confirmation-mark">✓</div><p className="registration-eyebrow">Submitted</p><h1>Thank you!</h1><p>Your registration for <strong>{program.name}</strong> has been received and is waiting for staff review.</p><div className="confirmation-code"><small>Confirmation code</small><strong>{confirmation}</strong></div><p className="public-registration-note">Please save this code. Submitting a form does not guarantee enrollment until the center reviews it.</p></section></main>

  return <main className="public-registration-shell">
    <section className="public-registration-card registration-header-card"><div className="public-registration-brand"><span>JH</span><div><strong>Juanita Hub</strong><small>Juanita Sanders CLC Registration</small></div></div><p className="registration-eyebrow">Program registration</p><h1>{program.name}</h1>{program.season_label&&<p className="registration-season">{program.season_label}</p>}{program.introduction?<p className="registration-intro">{program.introduction}</p>:program.description&&<p className="registration-intro">{program.description}</p>}<div className="registration-program-facts">{program.starts_on&&<span>{dateLabel(program.starts_on)}{program.ends_on?` – ${dateLabel(program.ends_on)}`:''}</span>}{program.location&&<span>{program.location}</span>}{program.meeting_days?.length>0&&<span>{program.meeting_days.join(', ')}</span>}</div></section>

    {error&&<div className="public-registration-error">{error}</div>}

    {!mode || program.registration_modes.length>1 ? <section className="public-registration-card"><p className="registration-eyebrow">Step 1</p><h2>How are you registering?</h2><div className="registration-mode-options">{program.registration_modes.map(m=><button key={m} className={mode===m?'selected':''} onClick={()=>selectMode(m)}><strong>{modeLabels[m]}</strong><span>{modeDescriptions[m]}</span>{['renewal','summer_short','permission_only'].includes(m)&&!token&&<em>Secure family link required</em>}</button>)}</div></section>:null}

    {mode && tokenMode && !token ? <section className="public-registration-card renewal-needed"><h2>Use your secure family link</h2><p>This option reuses information already stored for your household. For privacy, it can only be opened from a secure link provided by Juanita Sanders CLC staff.</p><p>If you need a renewal link, contact the center. New families can choose another registration option above.</p></section> : mode ? <>
      {mode !== 'adult_short' && !permissionMode && <section className="public-registration-card"><p className="registration-eyebrow">Family information</p><h2>Parent / guardian</h2><div className="public-form-grid"><label><span>Full name *</span><input value={guardian.name} onChange={e=>setGuardian({...guardian,name:e.target.value})}/></label><label><span>Relationship</span><input value={guardian.relationship} onChange={e=>setGuardian({...guardian,relationship:e.target.value})}/></label><label><span>Email</span><input type="email" value={guardian.email} onChange={e=>setGuardian({...guardian,email:e.target.value})}/></label><label><span>Phone</span><input type="tel" value={guardian.phone} onChange={e=>setGuardian({...guardian,phone:e.target.value})}/></label><label><span>Other phone</span><input type="tel" value={guardian.other_phone} onChange={e=>setGuardian({...guardian,other_phone:e.target.value})}/></label><label><span>Preferred contact</span><select value={guardian.preferred_contact} onChange={e=>setGuardian({...guardian,preferred_contact:e.target.value})}><option>Text</option><option>Phone</option><option>Email</option></select></label><label className="full"><span>Current address</span><input value={guardian.address} onChange={e=>setGuardian({...guardian,address:e.target.value})}/></label></div></section>}

      {mode !== 'adult_short' && !permissionMode && <section className="public-registration-card"><p className="registration-eyebrow">Emergency contact</p><h2>Someone other than the parent / guardian</h2><div className="public-form-grid"><label><span>Full name</span><input value={emergency.name} onChange={e=>setEmergency({...emergency,name:e.target.value})}/></label><label><span>Relationship</span><input value={emergency.relationship} onChange={e=>setEmergency({...emergency,relationship:e.target.value})}/></label><label><span>Phone</span><input type="tel" value={emergency.phone} onChange={e=>setEmergency({...emergency,phone:e.target.value})}/></label></div></section>}

      {mode !== 'adult_short' && <section className="public-registration-card"><p className="registration-eyebrow">Children</p><h2>{tokenMode?'Choose who is participating':'Add participating children'}</h2><div className="public-children-list">{children.map((child,index)=><article className={`public-child-card ${child.selected?'selected':''}`} key={`${child.existing_child_id||'new'}-${index}`}>
        {tokenMode&&<label className="child-select"><input type="checkbox" checked={child.selected} onChange={e=>updateChild(index,{selected:e.target.checked})}/><span><strong>{child.first_name} {child.last_name}</strong><small>{permissionMode?'Give permission for this child':'Include this child in this registration'}</small></span></label>}
        {(!tokenMode || child.selected) && !permissionMode && <>
          <div className="public-form-grid child-basics">{newYouthMode&&<><label><span>First name *</span><input value={child.first_name} onChange={e=>updateChild(index,{first_name:e.target.value})}/></label><label><span>Last name</span><input value={child.last_name} onChange={e=>updateChild(index,{last_name:e.target.value})}/></label></>}<label><span>Date of birth</span><input type="date" value={child.birth_date} onChange={e=>updateChild(index,{birth_date:e.target.value})}/></label>{!summerMode&&<><label><span>School</span><input value={child.school} onChange={e=>updateChild(index,{school:e.target.value})}/></label><label><span>Grade</span><input value={child.grade} onChange={e=>updateChild(index,{grade:e.target.value})}/></label></>}</div>
          {(fullDetails||summerMode) && <div className="child-subsection"><h3>Planned attendance</h3><div className="registration-day-checks">{days.slice(0,5).map(day=><label key={day} className={child.attendance_days.includes(day)?'selected':''}><input type="checkbox" checked={child.attendance_days.includes(day)} onChange={()=>toggleDay(index,day)}/>{day.slice(0,3)}</label>)}</div><label className="inline-check"><input type="checkbox" checked={child.attends_other_program} onChange={e=>updateChild(index,{attends_other_program:e.target.checked})}/> This child has another program, sport, camp, or commitment</label>{child.attends_other_program&&<label className="stacked"><span>When should we expect them / which dates are affected?</span><textarea rows={2} value={child.other_program_arrival_notes} onChange={e=>updateChild(index,{other_program_arrival_notes:e.target.value})}/></label>}{summerMode&&<div className="public-form-grid"><label><span>Shirt size</span><input value={child.shirt_size} onChange={e=>updateChild(index,{shirt_size:e.target.value})}/></label><label><span>Food allergies / dietary restrictions</span><input value={child.dietary_restrictions} onChange={e=>updateChild(index,{dietary_restrictions:e.target.value})}/></label></div>}</div>}
          {(fullDetails||summerMode||mode==='short_youth') && <div className="child-subsection safety"><h3>Safety & support</h3><p>Please update anything that staff should know for this program.</p><div className="public-form-grid"><label><span>Allergies</span><textarea rows={2} value={child.allergies} onChange={e=>updateChild(index,{allergies:e.target.value})}/></label><label><span>Medical conditions</span><textarea rows={2} value={child.medical_conditions} onChange={e=>updateChild(index,{medical_conditions:e.target.value})}/></label><label><span>IEP / learning support</span><textarea rows={2} value={child.learning_support} onChange={e=>updateChild(index,{learning_support:e.target.value})}/></label><label><span>Behavioral support</span><textarea rows={2} value={child.behavioral_support} onChange={e=>updateChild(index,{behavioral_support:e.target.value})}/></label><label className="full"><span>Actions staff should take / important care notes</span><textarea rows={3} value={child.actions_to_take} onChange={e=>updateChild(index,{actions_to_take:e.target.value})}/></label></div></div>}
        </>}
        {newYouthMode&&children.length>1&&<button className="remove-child" onClick={()=>setChildren(current=>current.filter((_,i)=>i!==index))}>Remove child</button>}
      </article>)}</div>{newYouthMode&&<button className="add-child" onClick={()=>setChildren(current=>[...current,blankChild()])}>+ Add another child</button>}</section>}

      {mode==='adult_short'&&<section className="public-registration-card"><p className="registration-eyebrow">Participant</p><h2>Adult registration</h2><div className="public-form-grid"><label><span>First name *</span><input value={adult.first_name} onChange={e=>setAdult({...adult,first_name:e.target.value})}/></label><label><span>Last name</span><input value={adult.last_name} onChange={e=>setAdult({...adult,last_name:e.target.value})}/></label><label><span>Email</span><input type="email" value={adult.email} onChange={e=>setAdult({...adult,email:e.target.value})}/></label><label><span>Phone</span><input type="tel" value={adult.phone} onChange={e=>setAdult({...adult,phone:e.target.value})}/></label><label className="full"><span>Address</span><input value={adult.address} onChange={e=>setAdult({...adult,address:e.target.value})}/></label><label><span>Emergency contact</span><input value={adult.emergency_contact_name} onChange={e=>setAdult({...adult,emergency_contact_name:e.target.value})}/></label><label><span>Emergency contact phone</span><input value={adult.emergency_contact_phone} onChange={e=>setAdult({...adult,emergency_contact_phone:e.target.value})}/></label></div></section>}

      {applicableConsents.length>0&&<section className="public-registration-card"><p className="registration-eyebrow">Permissions</p><h2>Review program permissions</h2><div className="public-consents">{applicableConsents.map(consent=><label key={consent.id}><input type="checkbox" checked={consentAnswers[String(consent.id)]===true} onChange={e=>setConsentAnswers(current=>({...current,[String(consent.id)]:e.target.checked}))}/><span><strong>{consent.title}{consent.required?' *':''}</strong><p>{consent.body}</p></span></label>)}</div></section>}

      <section className="public-registration-card"><p className="registration-eyebrow">Review & sign</p><h2>Confirm your submission</h2><label className="accuracy-check"><input type="checkbox" checked={accuracy} onChange={e=>setAccuracy(e.target.checked)}/><span>I confirm that the information I provided or reviewed is accurate and current to the best of my knowledge.</span></label><div className="public-form-grid signature-grid"><label><span>Type your full name as your electronic signature *</span><input value={signatureName} onChange={e=>setSignatureName(e.target.value)}/></label><label><span>Date *</span><input type="date" value={signatureDate} onChange={e=>setSignatureDate(e.target.value)}/></label></div><label className="website-field" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={e=>setWebsite(e.target.value)}/></label><button className="registration-submit" disabled={submitting||!accuracy||!signatureName.trim()||!signatureDate} onClick={()=>void submit()}>{submitting?'Submitting…':'Submit registration'}</button><p className="public-registration-note">Your information is sent securely to Juanita Sanders CLC staff for review. Submission does not automatically guarantee enrollment.</p></section>
    </> : null}
  </main>
}
